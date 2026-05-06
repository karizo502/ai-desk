/**
 * AI_DESK — User Profile Store
 *
 * Stores facts about users (preferences, expertise, working style) per agent.
 * Distinct from MemoryStore (which stores episodic memories) and SkillTraceStore
 * (which stores session traces for synthesis).
 *
 * Stored at: <dataDir>/memory/user-profile.db
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { v4 as uuid } from 'uuid';

export type ProfileCategory = 'preference' | 'expertise' | 'style' | 'context' | 'identity';

export interface ProfileFact {
  id: string;
  agentId: string;
  category: ProfileCategory;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_RECALL_LIMIT = 10;
/** Rough chars-per-token estimate for prompt truncation */
const CHARS_PER_TOKEN = 4;

export class UserProfileStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    const dir = resolve(dataDir, 'memory');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(resolve(dir, 'user-profile.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL,
        category    TEXT NOT NULL,
        content     TEXT NOT NULL,
        tags        TEXT NOT NULL DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_profile_agent ON profiles(agent_id);
      CREATE INDEX IF NOT EXISTS idx_profile_category ON profiles(agent_id, category);

      CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(
        content,
        agent_id UNINDEXED,
        id UNINDEXED,
        content='profiles',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS prof_ai AFTER INSERT ON profiles BEGIN
        INSERT INTO profiles_fts(rowid, content, agent_id, id)
        VALUES (new.rowid, new.content, new.agent_id, new.id);
      END;

      CREATE TRIGGER IF NOT EXISTS prof_ad AFTER DELETE ON profiles BEGIN
        INSERT INTO profiles_fts(profiles_fts, rowid, content, agent_id, id)
        VALUES ('delete', old.rowid, old.content, old.agent_id, old.id);
      END;

      CREATE TRIGGER IF NOT EXISTS prof_au AFTER UPDATE ON profiles BEGIN
        INSERT INTO profiles_fts(profiles_fts, rowid, content, agent_id, id)
        VALUES ('delete', old.rowid, old.content, old.agent_id, old.id);
        INSERT INTO profiles_fts(rowid, content, agent_id, id)
        VALUES (new.rowid, new.content, new.agent_id, new.id);
      END;
    `);
  }

  /** Store a new fact about the user */
  remember(
    agentId: string,
    content: string,
    category: ProfileCategory = 'context',
    tags: string[] = [],
  ): string {
    const id = uuid();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO profiles (id, agent_id, category, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agentId, category, content.trim(), JSON.stringify(tags), now, now);
    return id;
  }

  /**
   * Recall facts relevant to a topic (FTS5 search).
   * Falls back to most-recent facts when topic is empty.
   */
  recall(agentId: string, topic?: string, limit = DEFAULT_RECALL_LIMIT): ProfileFact[] {
    if (!topic?.trim()) return this.recallRecent(agentId, limit);

    const sanitised = topic.replace(/['"*()[\]{}]/g, ' ').trim();
    try {
      const rows = this.db.prepare(`
        SELECT p.*
        FROM profiles_fts
        JOIN profiles p ON profiles_fts.id = p.id
        WHERE profiles_fts MATCH ? AND profiles_fts.agent_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitised, agentId, limit) as RawFact[];
      return rows.map(toFact);
    } catch {
      return this.recallRecent(agentId, limit);
    }
  }

  /** Recall all facts in a specific category */
  recallByCategory(agentId: string, category: ProfileCategory): ProfileFact[] {
    const rows = this.db.prepare(`
      SELECT * FROM profiles WHERE agent_id = ? AND category = ?
      ORDER BY updated_at DESC
    `).all(agentId, category) as RawFact[];
    return rows.map(toFact);
  }

  /** Remove a specific fact by ID */
  forget(id: string): boolean {
    return this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id).changes > 0;
  }

  /** Remove all facts for an agent */
  forgetAll(agentId: string): number {
    return this.db.prepare('DELETE FROM profiles WHERE agent_id = ?').run(agentId).changes;
  }

  /**
   * Build a compact string snippet of the user profile for injection into the
   * system prompt. Respects maxTokens budget (rough estimate via char count).
   * Groups facts by category, prioritises identity > expertise > preference > style > context.
   */
  toPromptSnippet(agentId: string, maxTokens = 200): string {
    const order: ProfileCategory[] = ['identity', 'expertise', 'preference', 'style', 'context'];
    const allFacts: ProfileFact[] = [];

    for (const cat of order) {
      allFacts.push(...this.recallByCategory(agentId, cat));
    }

    if (allFacts.length === 0) return '';

    const maxChars = maxTokens * CHARS_PER_TOKEN;
    const lines: string[] = ['[User profile]'];
    let used = lines[0].length + 1;

    for (const fact of allFacts) {
      const line = `- [${fact.category}] ${fact.content}`;
      if (used + line.length + 1 > maxChars) break;
      lines.push(line);
      used += line.length + 1;
    }

    return lines.join('\n');
  }

  close(): void {
    this.db.close();
  }

  private recallRecent(agentId: string, limit: number): ProfileFact[] {
    const rows = this.db.prepare(`
      SELECT * FROM profiles WHERE agent_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(agentId, limit) as RawFact[];
    return rows.map(toFact);
  }
}

function toFact(r: RawFact): ProfileFact {
  return {
    id: r.id,
    agentId: r.agent_id,
    category: r.category as ProfileCategory,
    content: r.content,
    tags: JSON.parse(r.tags) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface RawFact {
  id: string;
  agent_id: string;
  category: string;
  content: string;
  tags: string;
  created_at: number;
  updated_at: number;
}
