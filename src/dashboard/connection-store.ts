/**
 * AI_DESK — Per-Agent Connection Store
 *
 * Persists per-agent Telegram/Discord connections in SQLite.
 * Bot tokens are stored AES-256-GCM encrypted using the master key.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { encrypt, decrypt } from '../shared/crypto.js';

export interface PlatformConnection {
  id: string;
  label: string;
  platform: 'telegram' | 'discord';
  agentId: string;
  enabled: boolean;
  createdAt: number;
  connectedAt: number | null;
  botUsername: string | null;
}

/** Same as PlatformConnection but includes the decrypted token — only used internally */
export interface PlatformConnectionFull extends PlatformConnection {
  token: string;
}

export class ConnectionStore {
  private db: ReturnType<typeof Database>;
  private masterKey: string;

  constructor(dataDir: string, masterKey: string) {
    this.masterKey = masterKey;
    mkdirSync(dataDir, { recursive: true });
    this.db = Database(join(dataDir, 'connections.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id             TEXT    PRIMARY KEY,
        label          TEXT    NOT NULL,
        platform       TEXT    NOT NULL,
        agent_id       TEXT    NOT NULL,
        token_enc      BLOB    NOT NULL,
        enabled        INTEGER NOT NULL DEFAULT 1,
        created_at     INTEGER NOT NULL,
        connected_at   INTEGER,
        bot_username   TEXT
      )
    `);
  }

  create(input: {
    label: string;
    platform: 'telegram' | 'discord';
    agentId: string;
    token: string;
  }): PlatformConnection {
    const id  = randomBytes(6).toString('hex');
    const now = Date.now();
    const enc = encrypt(input.token, this.masterKey);
    this.db.prepare(`
      INSERT INTO connections (id, label, platform, agent_id, token_enc, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, input.label, input.platform, input.agentId, enc, now);
    return this.get(id)!;
  }

  get(id: string): PlatformConnection | undefined {
    const row = this.db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toPublic(row) : undefined;
  }

  getFull(id: string): PlatformConnectionFull | undefined {
    const row = this.db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const token = decrypt(row['token_enc'] as Buffer, this.masterKey);
    return { ...this.toPublic(row), token };
  }

  list(): PlatformConnection[] {
    return (this.db.prepare('SELECT * FROM connections ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(r => this.toPublic(r));
  }

  setConnected(id: string, botUsername: string | null): void {
    this.db.prepare('UPDATE connections SET connected_at = ?, bot_username = ? WHERE id = ?')
      .run(Date.now(), botUsername, id);
  }

  clearConnected(id: string): void {
    this.db.prepare('UPDATE connections SET connected_at = NULL WHERE id = ?').run(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare('UPDATE connections SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM connections WHERE id = ?').run(id).changes > 0;
  }

  close(): void { this.db.close(); }

  private toPublic(row: Record<string, unknown>): PlatformConnection {
    return {
      id:           row['id'] as string,
      label:        row['label'] as string,
      platform:     row['platform'] as 'telegram' | 'discord',
      agentId:      row['agent_id'] as string,
      enabled:      Boolean(row['enabled']),
      createdAt:    row['created_at'] as number,
      connectedAt:  (row['connected_at'] as number | null) ?? null,
      botUsername:  (row['bot_username'] as string | null) ?? null,
    };
  }
}
