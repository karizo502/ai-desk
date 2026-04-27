/**
 * AI_DESK — Session Store
 *
 * Encrypted session storage using SQLite.
 * Per-channel-peer isolation by default.
 */
import Database from 'better-sqlite3';
import { encrypt, decrypt } from '../shared/crypto.js';
import { v4 as uuid } from 'uuid';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface SessionData {
  id: string;
  agentId: string;
  channelId: string;
  peerId: string;
  createdAt: number;
  lastActiveAt: number;
  state: 'active' | 'idle' | 'closed';
  transcript: unknown[];     // Conversation history
  metadata: Record<string, unknown>;
}

export class SessionStore {
  private db: Database.Database;
  private masterKey: string;

  constructor(dataDir: string, masterKey: string) {
    this.masterKey = masterKey;
    const dbDir = resolve(dataDir, 'sessions');
    mkdirSync(dbDir, { recursive: true });

    this.db = new Database(resolve(dbDir, 'sessions.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'active',
        encrypted_data BLOB NOT NULL,
        UNIQUE(agent_id, channel_id, peer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_channel_peer ON sessions(channel_id, peer_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    `);
  }

  /** Create a new session (enforces per-channel-peer isolation) */
  create(agentId: string, channelId: string, peerId: string): SessionData {
    // Check for existing active session
    const existing = this.findByPeer(agentId, channelId, peerId);
    if (existing && existing.state === 'active') {
      return existing;
    }

    const session: SessionData = {
      id: uuid(),
      agentId,
      channelId,
      peerId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      state: 'active',
      transcript: [],
      metadata: {},
    };

    const encrypted = encrypt(
      JSON.stringify({ transcript: session.transcript, metadata: session.metadata }),
      this.masterKey
    );

    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, agent_id, channel_id, peer_id, created_at, last_active_at, state, encrypted_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.agentId, session.channelId, session.peerId,
      session.createdAt, session.lastActiveAt, session.state, encrypted
    );

    return session;
  }

  /** Get session by ID */
  get(sessionId: string): SessionData | null {
    const row = this.db.prepare(
      'SELECT * FROM sessions WHERE id = ?'
    ).get(sessionId) as RawSessionRow | undefined;

    if (!row) return null;
    return this.deserialize(row);
  }

  /** Find session by agent + channel + peer */
  findByPeer(agentId: string, channelId: string, peerId: string): SessionData | null {
    const row = this.db.prepare(
      'SELECT * FROM sessions WHERE agent_id = ? AND channel_id = ? AND peer_id = ? AND state = ?'
    ).get(agentId, channelId, peerId, 'active') as RawSessionRow | undefined;

    if (!row) return null;
    return this.deserialize(row);
  }

  /** Update session data (transcript, metadata, etc.) */
  update(sessionId: string, updates: Partial<Pick<SessionData, 'transcript' | 'metadata' | 'state'>>): void {
    const existing = this.get(sessionId);
    if (!existing) throw new Error(`Session ${sessionId} not found`);

    const updated = {
      transcript: updates.transcript ?? existing.transcript,
      metadata: updates.metadata ?? existing.metadata,
    };

    const encrypted = encrypt(JSON.stringify(updated), this.masterKey);

    this.db.prepare(`
      UPDATE sessions SET
        last_active_at = ?,
        state = ?,
        encrypted_data = ?
      WHERE id = ?
    `).run(
      Date.now(),
      updates.state ?? existing.state,
      encrypted,
      sessionId
    );
  }

  /** Close a session */
  close(sessionId: string): void {
    this.update(sessionId, { state: 'closed' });
  }

  /** List active sessions for an agent */
  listActive(agentId?: string): SessionData[] {
    let query = 'SELECT * FROM sessions WHERE state = ?';
    const params: unknown[] = ['active'];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    query += ' ORDER BY last_active_at DESC';

    const rows = this.db.prepare(query).all(...params) as RawSessionRow[];
    return rows.map(r => this.deserialize(r));
  }

  /** Cleanup old closed sessions */
  purgeOld(maxAgeMs: number = 7 * 86_400_000): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare(
      'DELETE FROM sessions WHERE state = ? AND last_active_at < ?'
    ).run('closed', cutoff);
    return result.changes;
  }

  private deserialize(row: RawSessionRow): SessionData {
    let data = { transcript: [], metadata: {} };
    try {
      const decrypted = decrypt(row.encrypted_data, this.masterKey);
      data = JSON.parse(decrypted);
    } catch {
      // If decryption fails, start with empty data
    }

    return {
      id: row.id,
      agentId: row.agent_id,
      channelId: row.channel_id,
      peerId: row.peer_id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      state: row.state as SessionData['state'],
      transcript: data.transcript ?? [],
      metadata: data.metadata ?? {},
    };
  }

  close_db(): void {
    this.db.close();
  }
}

interface RawSessionRow {
  id: string;
  agent_id: string;
  channel_id: string;
  peer_id: string;
  created_at: number;
  last_active_at: number;
  state: string;
  encrypted_data: Buffer;
}
