/**
 * AI_DESK — Credential Store
 *
 * Encrypted SQLite storage for provider API keys and OAuth tokens.
 * Uses the same AES-256-GCM scheme as TokenStore.
 *
 * Schema per provider:
 *   anthropic   → { type: 'api_key', apiKey }
 *               | { type: 'claude_code', accessToken, expiresAt? }
 *   google      → { type: 'api_key', apiKey }
 *               | { type: 'oauth', accessToken, refreshToken, expiresAt, email? }
 *   openrouter  → { type: 'api_key', apiKey }
 */
import Database from 'better-sqlite3';
import { encrypt, decrypt } from '../shared/crypto.js';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

export type AnthropicCredential =
  | { type: 'api_key'; apiKey: string }
  | { type: 'claude_code'; accessToken: string; expiresAt?: number };

export type GoogleCredential =
  | { type: 'api_key'; apiKey: string }
  | { type: 'oauth'; accessToken: string; refreshToken: string; expiresAt: number; email?: string; clientId?: string; clientSecret?: string };

export type OpenRouterCredential = { type: 'api_key'; apiKey: string };

export type ProviderCredential = AnthropicCredential | GoogleCredential | OpenRouterCredential;

// ─── Gemini CLI credential file helpers ───────────────────────────────────────

interface GeminiCliFile {
  access_token?:  string;
  refresh_token?: string;
  expiry_date?:   number;   // ms timestamp (some versions)
  token_expiry?:  string;   // ISO date string (other versions)
  client_id?:     string;
  client_secret?: string;
  type?:          string;
}

export function geminiCliCredentialsPath(): string {
  return join(homedir(), '.gemini', 'oauth_creds.json');
}

export function readGeminiCliCredentials(): {
  accessToken?:  string;
  refreshToken?: string;
  expiresAt?:    number;
  clientId?:     string;
  clientSecret?: string;
} | null {
  const path = geminiCliCredentialsPath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as GeminiCliFile;
    if (!data.refresh_token && !data.access_token) return null;

    let expiresAt: number | undefined;
    if (data.expiry_date)    expiresAt = data.expiry_date;
    else if (data.token_expiry) expiresAt = new Date(data.token_expiry).getTime();

    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      clientId:     data.client_id,
      clientSecret: data.client_secret,
    };
  } catch {
    return null;
  }
}

// ─── Claude Code credential file helpers ──────────────────────────────────────

interface ClaudeCodeFile {
  claudeAiOauth?: {
    accessToken:  string;
    refreshToken?: string;
    expiresAt?:   number;
    tokenType?:   string;
  };
}

/**
 * Path to the Claude Code credentials file.
 * Claude Code stores OAuth tokens at ~/.claude/.credentials.json
 */
export function claudeCodeCredentialsPath(): string {
  return join(homedir(), '.claude', '.credentials.json');
}

/**
 * Read and return Claude Code OAuth credentials from disk if present and not expired.
 * Returns null if the file doesn't exist, is unreadable, or the token is expired.
 */
export function readClaudeCodeCredentials(): { accessToken: string; expiresAt?: number } | null {
  const path = claudeCodeCredentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw  = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as ClaudeCodeFile;
    const oauth = data.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    // Treat as valid if no expiresAt or not yet expired (with 5-min buffer)
    if (oauth.expiresAt && Date.now() >= oauth.expiresAt - 5 * 60 * 1000) return null;
    return { accessToken: oauth.accessToken, expiresAt: oauth.expiresAt };
  } catch {
    return null;
  }
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export class CredentialStore {
  private db: Database.Database;
  private masterKey: string;

  constructor(dataDir: string, masterKey: string) {
    this.masterKey = masterKey;
    const dbDir = resolve(dataDir, 'security');
    mkdirSync(dbDir, { recursive: true });
    this.db = new Database(resolve(dbDir, 'credentials.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        provider    TEXT PRIMARY KEY,
        encrypted   BLOB NOT NULL,
        updated_at  INTEGER NOT NULL
      );
    `);
  }

  set(provider: string, cred: ProviderCredential): void {
    const encrypted = encrypt(JSON.stringify(cred), this.masterKey);
    this.db.prepare(`
      INSERT INTO credentials (provider, encrypted, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider) DO UPDATE
        SET encrypted = excluded.encrypted, updated_at = excluded.updated_at
    `).run(provider, encrypted, Date.now());
  }

  get(provider: string): ProviderCredential | null {
    const row = this.db.prepare(
      `SELECT encrypted FROM credentials WHERE provider = ?`
    ).get(provider) as { encrypted: Buffer } | undefined;

    if (!row) return null;
    try {
      return JSON.parse(decrypt(row.encrypted, this.masterKey)) as ProviderCredential;
    } catch {
      return null;
    }
  }

  delete(provider: string): boolean {
    return (this.db.prepare(`DELETE FROM credentials WHERE provider = ?`).run(provider)).changes > 0;
  }

  /** Summary for dashboard status endpoint — never exposes raw secrets */
  status(): Record<string, { configured: boolean; type?: string; email?: string; expiresAt?: number }> {
    const rows = this.db.prepare(
      `SELECT provider, encrypted FROM credentials`
    ).all() as Array<{ provider: string; encrypted: Buffer }>;

    const result: Record<string, { configured: boolean; type?: string; email?: string; expiresAt?: number }> = {};
    for (const row of rows) {
      try {
        const cred = JSON.parse(decrypt(row.encrypted, this.masterKey)) as ProviderCredential;
        const isOAuth      = cred.type === 'oauth';
        const isClaudeCode = cred.type === 'claude_code';
        result[row.provider] = {
          configured: true,
          type:      cred.type,
          email:     isOAuth ? (cred as { email?: string }).email : undefined,
          expiresAt: (isOAuth || isClaudeCode)
            ? (cred as { expiresAt?: number }).expiresAt
            : undefined,
        };
      } catch {
        result[row.provider] = { configured: false };
      }
    }
    return result;
  }

  /** Returns the API key for a provider, or undefined if not stored as api_key type */
  getApiKey(provider: string): string | undefined {
    const cred = this.get(provider);
    if (!cred || cred.type !== 'api_key') return undefined;
    return (cred as { type: 'api_key'; apiKey: string }).apiKey;
  }

  /**
   * Returns a valid Anthropic access token (claude_code OAuth).
   * Returns undefined if credential is not of type claude_code or is expired.
   */
  getAnthropicOAuthToken(): string | undefined {
    const cred = this.get('anthropic') as AnthropicCredential | null;
    if (!cred || cred.type !== 'claude_code') return undefined;
    if (cred.expiresAt && Date.now() >= cred.expiresAt - 5 * 60 * 1000) return undefined;
    return cred.accessToken;
  }

  /**
   * Returns a valid Google access token.
   * If the stored OAuth token is near expiry, it is automatically refreshed
   * using GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars.
   * Returns undefined when no OAuth credential is stored.
   */
  async getValidGoogleAccessToken(): Promise<string | undefined> {
    const cred = this.get('google') as GoogleCredential | null;
    if (!cred || cred.type !== 'oauth') return undefined;

    const needsRefresh = Date.now() >= cred.expiresAt - TOKEN_REFRESH_BUFFER_MS;
    if (!needsRefresh) return cred.accessToken;

    if (!cred.refreshToken) return cred.accessToken; // no refresh token — use as-is

    const clientId     = process.env.GOOGLE_CLIENT_ID     ?? cred.clientId     ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? cred.clientSecret ?? '';
    if (!clientId || !clientSecret) return cred.accessToken; // can't refresh without client creds

    try {
      const resp = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: cred.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const data = await resp.json() as {
        access_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (data.access_token) {
        const newExpiresAt = Date.now() + ((data.expires_in ?? 3600) * 1000);
        this.set('google', { ...cred, accessToken: data.access_token, expiresAt: newExpiresAt });
        return data.access_token;
      }
    } catch {
      // Fall through — return the (possibly expired) existing token
    }

    return cred.accessToken;
  }

  close(): void {
    this.db.close();
  }
}
