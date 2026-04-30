/**
 * AI_DESK — Memory Store
 *
 * Per-agent persistent memory using SQLite FTS5.
 * Memories survive across sessions — agents remember key facts, decisions,
 * user preferences, and context from past conversations.
 *
 * Retrieval uses full-text search ranked by relevance + recency + importance.
 * No external embedding model required.
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { v4 as uuid } from 'uuid';

export interface Memory {
  id: string;
  agentId: string;
  sessionId: string;
  content: string;
  importance: number;   // 0.0–1.0
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

const MAX_MEMORIES_PER_AGENT = 500;
const DEFAULT_RETRIEVE_LIMIT = 8;

export class MemoryStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    const dir = resolve(dataDir, 'memory');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(resolve(dir, 'memories.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        content     TEXT NOT NULL,
        importance  REAL NOT NULL DEFAULT 0.5,
        created_at  INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_mem_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_mem_agent_importance ON memories(agent_id, importance DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        agent_id UNINDEXED,
        id UNINDEXED,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS mem_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, agent_id, id)
        VALUES (new.rowid, new.content, new.agent_id, new.id);
      END;

      CREATE TRIGGER IF NOT EXISTS mem_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, agent_id, id)
        VALUES ('delete', old.rowid, old.content, old.agent_id, old.id);
      END;

      CREATE TRIGGER IF NOT EXISTS mem_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, agent_id, id)
        VALUES ('delete', old.rowid, old.content, old.agent_id, old.id);
        INSERT INTO memories_fts(rowid, content, agent_id, id)
        VALUES (new.rowid, new.content, new.agent_id, new.id);
      END;
    `);
  }

  /** Store a new memory for an agent */
  store(agentId: string, sessionId: string, content: string, importance = 0.5): string {
    const id = uuid();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO memories (id, agent_id, session_id, content, importance, created_at, accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, agentId, sessionId, content.trim(), importance, now, now);
    return id;
  }

  /**
   * Retrieve memories relevant to a query for a given agent.
   * Uses FTS5 for text match, ranked by: relevance × importance × recency.
   */
  retrieve(agentId: string, query: string, limit = DEFAULT_RETRIEVE_LIMIT): Memory[] {
    const sanitised = query.replace(/['"*()[\]{}]/g, ' ').trim();
    if (!sanitised) return this.retrieveRecent(agentId, limit);

    try {
      const rows = this.db.prepare(`
        SELECT m.*, bm25(memories_fts) AS fts_score
        FROM memories_fts
        JOIN memories m ON memories_fts.id = m.id
        WHERE memories_fts MATCH ? AND memories_fts.agent_id = ?
        ORDER BY (bm25(memories_fts) * -1) * m.importance * (1.0 / (1 + (unixepoch('now') * 1000 - m.accessed_at) / 86400000.0))  DESC
        LIMIT ?
      `).all(sanitised, agentId, limit) as RawMemory[];

      if (rows.length > 0) this.touchAccess(rows.map(r => r.id));
      return rows.map(toMemory);
    } catch {
      // FTS query parse error (e.g. very short tokens) — fall back to recency
      return this.retrieveRecent(agentId, limit);
    }
  }

  /** Retrieve most recent/important memories when no query is available */
  retrieveRecent(agentId: string, limit = DEFAULT_RETRIEVE_LIMIT): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories
      WHERE agent_id = ?
      ORDER BY importance DESC, accessed_at DESC
      LIMIT ?
    `).all(agentId, limit) as RawMemory[];
    return rows.map(toMemory);
  }

  /** Remove a specific memory */
  remove(id: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  /** Prune oldest / least important memories when over the per-agent cap */
  pruneOverflow(agentId: string): number {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE agent_id = ?')
      .get(agentId) as { c: number }).c;

    if (count <= MAX_MEMORIES_PER_AGENT) return 0;

    const excess = count - MAX_MEMORIES_PER_AGENT;
    const result = this.db.prepare(`
      DELETE FROM memories WHERE id IN (
        SELECT id FROM memories WHERE agent_id = ?
        ORDER BY importance ASC, accessed_at ASC
        LIMIT ?
      )
    `).run(agentId, excess);
    return result.changes;
  }

  /** How many memories an agent has */
  count(agentId: string): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE agent_id = ?')
      .get(agentId) as { c: number }).c;
  }

  close(): void {
    this.db.close();
  }

  private touchAccess(ids: string[]): void {
    const now = Date.now();
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(
      `UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id IN (${placeholders})`
    ).run(now, ...ids);
  }
}

function toMemory(r: RawMemory): Memory {
  return {
    id: r.id,
    agentId: r.agent_id,
    sessionId: r.session_id,
    content: r.content,
    importance: r.importance,
    createdAt: r.created_at,
    accessedAt: r.accessed_at,
    accessCount: r.access_count,
  };
}

interface RawMemory {
  id: string;
  agent_id: string;
  session_id: string;
  content: string;
  importance: number;
  created_at: number;
  accessed_at: number;
  access_count: number;
}
