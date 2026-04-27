/**
 * AI_DESK — Encrypted Token Store
 *
 * Stores auth tokens encrypted with AES-256-GCM.
 * Supports token rotation, expiry, and audit trails.
 */
import Database from 'better-sqlite3';
import { encrypt, generateToken, sha256 } from '../shared/crypto.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// StoredToken fields mapped to SQLite columns below

export class TokenStore {
  private db: Database.Database;
  private masterKey: string;

  constructor(dataDir: string, masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error(
        'Master key must be at least 16 characters. Set AI_DESK_MASTER_KEY env var.'
      );
    }

    this.masterKey = masterKey;
    const dbDir = resolve(dataDir, 'security');
    mkdirSync(dbDir, { recursive: true });

    this.db = new Database(resolve(dbDir, 'tokens.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        encrypted_token BLOB NOT NULL,
        label TEXT NOT NULL DEFAULT 'default',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_tokens_revoked ON tokens(revoked);
    `);
  }

  /** Generate and store a new auth token */
  createToken(label: string, expiryMs: number = 86_400_000): {
    id: string;
    token: string;
  } {
    const rawToken = generateToken(32);
    const tokenHash = sha256(rawToken);
    const encryptedToken = encrypt(rawToken, this.masterKey);
    const now = Date.now();
    const id = sha256(tokenHash).slice(0, 16);

    this.db.prepare(`
      INSERT INTO tokens (id, token_hash, encrypted_token, label, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tokenHash, encryptedToken, label, now, now + expiryMs);

    return { id, token: rawToken };
  }

  /** Validate a token. Returns token ID if valid, null if not. */
  validateToken(rawToken: string): string | null {
    const tokenHash = sha256(rawToken);
    const now = Date.now();

    const row = this.db.prepare(`
      SELECT id, expires_at, revoked FROM tokens
      WHERE token_hash = ? AND revoked = 0 AND expires_at > ?
    `).get(tokenHash, now) as { id: string; expires_at: number; revoked: number } | undefined;

    if (!row) return null;

    // Update last used timestamp
    this.db.prepare(`
      UPDATE tokens SET last_used_at = ? WHERE id = ?
    `).run(now, row.id);

    return row.id;
  }

  /** Revoke a token by ID */
  revokeToken(tokenId: string): boolean {
    const result = this.db.prepare(`
      UPDATE tokens SET revoked = 1 WHERE id = ?
    `).run(tokenId);
    return result.changes > 0;
  }

  /** Revoke all tokens */
  revokeAll(): number {
    const result = this.db.prepare(`
      UPDATE tokens SET revoked = 1 WHERE revoked = 0
    `).run();
    return result.changes;
  }

  /** List all tokens (without raw values) */
  listTokens(): Array<{
    id: string;
    label: string;
    createdAt: number;
    expiresAt: number;
    lastUsedAt: number | null;
    revoked: boolean;
    expired: boolean;
  }> {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT id, label, created_at, expires_at, last_used_at, revoked FROM tokens
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      label: string;
      created_at: number;
      expires_at: number;
      last_used_at: number | null;
      revoked: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      label: r.label,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      lastUsedAt: r.last_used_at,
      revoked: r.revoked === 1,
      expired: now > r.expires_at,
    }));
  }

  /** Cleanup expired tokens (hard delete) */
  purgeExpired(): number {
    const now = Date.now();
    const result = this.db.prepare(`
      DELETE FROM tokens WHERE expires_at < ? AND revoked = 1
    `).run(now - 86_400_000); // Keep revoked tokens for 24h for audit
    return result.changes;
  }

  /** Close the database */
  close(): void {
    this.db.close();
  }
}
