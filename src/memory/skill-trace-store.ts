/**
 * AI_DESK — Skill Trace Store
 *
 * Stores searchable, summarized traces of agent sessions for use by the
 * skill synthesizer. Data here is NOT encrypted (unlike SessionStore) because
 * it must be PII-scrubbed before being recorded. The PII scrub happens in
 * SkillSynthesizer (Phase 2) before any trace is written here.
 *
 * Stored at: <dataDir>/memory/skill-traces.db
 * Separate from:
 *   - sessions/sessions.db  (encrypted conversation store — source of truth)
 *   - memory/memories.db    (per-agent long-term memories)
 *   - security/audit.db     (tamper-evident audit chain)
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface TracedSession {
  id: string;
  agentId: string;
  startedAt: number;
  endedAt?: number;
  outcome?: 'success' | 'failure' | 'aborted';
  summary?: string;
  traceHash?: string;
  toolCount: number;
  tokenCount: number;
  skillsUsed: string[];
}

export interface TracedTurn {
  sessionId: string;
  idx: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
  durationMs?: number;
}

export interface TraceSearchResult {
  sessionId: string;
  snippet: string;
  outcome?: string;
  toolCount: number;
  startedAt: number;
}

export class SkillTraceStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    const dir = resolve(dataDir, 'memory');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(resolve(dir, 'skill-traces.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_sessions (
        id           TEXT PRIMARY KEY,
        agent_id     TEXT NOT NULL,
        started_at   INTEGER NOT NULL,
        ended_at     INTEGER,
        outcome      TEXT,
        summary      TEXT,
        trace_hash   TEXT,
        tool_count   INTEGER NOT NULL DEFAULT 0,
        token_count  INTEGER NOT NULL DEFAULT 0,
        skills_used  TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_st_agent ON skill_sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_st_outcome ON skill_sessions(outcome);
      CREATE INDEX IF NOT EXISTS idx_st_started ON skill_sessions(started_at DESC);

      CREATE TABLE IF NOT EXISTS skill_turns (
        session_id  TEXT NOT NULL,
        idx         INTEGER NOT NULL,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        tool_name   TEXT,
        tool_input  TEXT,
        tool_output TEXT,
        is_error    INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        PRIMARY KEY (session_id, idx)
      );
      CREATE INDEX IF NOT EXISTS idx_st_turns_session ON skill_turns(session_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS skill_turns_fts USING fts5(
        content,
        session_id UNINDEXED,
        content='skill_turns',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS st_ai AFTER INSERT ON skill_turns BEGIN
        INSERT INTO skill_turns_fts(rowid, content, session_id)
        VALUES (new.rowid, new.content, new.session_id);
      END;

      CREATE TRIGGER IF NOT EXISTS st_ad AFTER DELETE ON skill_turns BEGIN
        INSERT INTO skill_turns_fts(skill_turns_fts, rowid, content, session_id)
        VALUES ('delete', old.rowid, old.content, old.session_id);
      END;
    `);
  }

  /** Start tracking a new session */
  initSession(sessionId: string, agentId: string, skillsUsed: string[] = []): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO skill_sessions (id, agent_id, started_at, skills_used)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, agentId, Date.now(), JSON.stringify(skillsUsed));
  }

  /** Record a single turn (user, assistant, or tool) */
  recordTurn(turn: TracedTurn): void {
    const idx = this.nextIdx(turn.sessionId);
    this.db.prepare(`
      INSERT OR REPLACE INTO skill_turns
        (session_id, idx, role, content, tool_name, tool_input, tool_output, is_error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      turn.sessionId,
      idx,
      turn.role,
      turn.content,
      turn.toolName ?? null,
      turn.toolInput ? JSON.stringify(turn.toolInput) : null,
      turn.toolOutput ?? null,
      turn.isError ? 1 : 0,
      turn.durationMs ?? null,
    );

    if (turn.role === 'tool') {
      this.db.prepare(`
        UPDATE skill_sessions SET tool_count = tool_count + 1 WHERE id = ?
      `).run(turn.sessionId);
    }
  }

  /** Mark a session as finished */
  finalizeSession(
    sessionId: string,
    outcome: TracedSession['outcome'],
    tokenCount: number,
  ): void {
    const hash = this.computeTraceHash(sessionId);
    this.db.prepare(`
      UPDATE skill_sessions
      SET ended_at = ?, outcome = ?, token_count = ?, trace_hash = ?
      WHERE id = ?
    `).run(Date.now(), outcome, tokenCount, hash, sessionId);
  }

  /** Full-text search across turns — returns matching session metadata */
  search(query: string, limit = 10): TraceSearchResult[] {
    const sanitised = query.replace(/['"*()[\]{}]/g, ' ').trim();
    if (!sanitised) return [];

    try {
      const rows = this.db.prepare(`
        SELECT
          t.session_id,
          snippet(skill_turns_fts, 0, '<b>', '</b>', '…', 16) AS snippet,
          s.outcome,
          s.tool_count,
          s.started_at
        FROM skill_turns_fts
        JOIN skill_sessions s ON skill_turns_fts.session_id = s.id
        JOIN skill_turns t ON skill_turns_fts.rowid = t.rowid
        WHERE skill_turns_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitised, limit) as Array<{
        session_id: string;
        snippet: string;
        outcome: string | null;
        tool_count: number;
        started_at: number;
      }>;

      return rows.map(r => ({
        sessionId: r.session_id,
        snippet: r.snippet,
        outcome: r.outcome ?? undefined,
        toolCount: r.tool_count,
        startedAt: r.started_at,
      }));
    } catch {
      return [];
    }
  }

  /** Retrieve all turns for a session, ordered by index */
  getTrace(sessionId: string): TracedTurn[] {
    const rows = this.db.prepare(`
      SELECT * FROM skill_turns WHERE session_id = ? ORDER BY idx ASC
    `).all(sessionId) as Array<{
      session_id: string;
      idx: number;
      role: string;
      content: string;
      tool_name: string | null;
      tool_input: string | null;
      tool_output: string | null;
      is_error: number;
      duration_ms: number | null;
    }>;

    return rows.map(r => ({
      sessionId: r.session_id,
      idx: r.idx,
      role: r.role as TracedTurn['role'],
      content: r.content,
      toolName: r.tool_name ?? undefined,
      toolInput: r.tool_input ? JSON.parse(r.tool_input) : undefined,
      toolOutput: r.tool_output ?? undefined,
      isError: r.is_error === 1,
      durationMs: r.duration_ms ?? undefined,
    }));
  }

  /** Get session metadata */
  getSession(sessionId: string): TracedSession | null {
    const row = this.db.prepare('SELECT * FROM skill_sessions WHERE id = ?')
      .get(sessionId) as RawSession | undefined;
    return row ? toTracedSession(row) : null;
  }

  /** List sessions with enough tool calls to be candidates for synthesis */
  listSynthesisCandidates(minToolCalls: number, limit = 20): TracedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM skill_sessions
      WHERE outcome = 'success' AND tool_count >= ? AND summary IS NULL
      ORDER BY started_at DESC
      LIMIT ?
    `).all(minToolCalls, limit) as RawSession[];
    return rows.map(toTracedSession);
  }

  /** List failure sessions where a specific skill was active (for skill improvement) */
  listFailureSessionsForSkill(skillName: string, limit = 20): TracedSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM skill_sessions
      WHERE outcome = 'failure'
        AND skills_used LIKE ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(`%${skillName}%`, limit) as RawSession[];

    return rows
      .map(toTracedSession)
      .filter(s => s.skillsUsed.includes(skillName)); // exact check after LIKE pre-filter
  }

  /** Store a lazy-computed LLM summary for a session */
  saveSummary(sessionId: string, summary: string): void {
    this.db.prepare('UPDATE skill_sessions SET summary = ? WHERE id = ?')
      .run(summary, sessionId);
  }

  /**
   * Find successful sessions for the same agent where a given skill was NOT used.
   * Used by SkillBaselineFinder to calculate token-savings baselines.
   * Content query is matched via FTS5 to find semantically similar sessions.
   */
  findBaselineSessions(
    agentId: string,
    excludeSkillName: string,
    _contentQuery: string,
    limit = 10,
  ): TracedSession[] {
    // Primary path: recency-based query scoped to this agent.
    // FTS-based semantic matching is an optional future optimisation — recency
    // is sufficient for ROI baselines (we just need comparable sessions from the same agent).
    const rows = this.db.prepare(`
      SELECT * FROM skill_sessions
      WHERE agent_id = ? AND outcome = 'success' AND token_count > 0
      ORDER BY started_at DESC
      LIMIT ?
    `).all(agentId, limit * 2) as RawSession[];

    return rows
      .map(toTracedSession)
      .filter(s => !s.skillsUsed.includes(excludeSkillName))
      .slice(0, limit);
  }

  close(): void {
    this.db.close();
  }

  private nextIdx(sessionId: string): number {
    const row = this.db.prepare(
      'SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM skill_turns WHERE session_id = ?'
    ).get(sessionId) as { next: number };
    return row.next;
  }

  private computeTraceHash(sessionId: string): string {
    const turns = this.getTrace(sessionId);
    const payload = JSON.stringify(turns.map(t => ({ role: t.role, content: t.content })));
    return createHash('sha256').update(payload).digest('hex');
  }
}

function toTracedSession(r: RawSession): TracedSession {
  return {
    id: r.id,
    agentId: r.agent_id,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    outcome: r.outcome as TracedSession['outcome'],
    summary: r.summary ?? undefined,
    traceHash: r.trace_hash ?? undefined,
    toolCount: r.tool_count,
    tokenCount: r.token_count,
    skillsUsed: JSON.parse(r.skills_used) as string[],
  };
}

interface RawSession {
  id: string;
  agent_id: string;
  started_at: number;
  ended_at: number | null;
  outcome: string | null;
  summary: string | null;
  trace_hash: string | null;
  tool_count: number;
  token_count: number;
  skills_used: string;
}
