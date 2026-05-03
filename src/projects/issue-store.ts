/**
 * AI_DESK — Issue Store
 *
 * Persists project issues (bugs, feature requests, questions) in the same
 * projects.db SQLite file used by ProjectStore.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

// ── Types ──────────────────────────────────────────────────────────────────

export type IssueKind   = 'bug' | 'feature_request' | 'question';
export type IssueStatus = 'open' | 'in_progress' | 'closed' | 'wontfix';

export interface ProjectIssue {
  id: string;                    // 'iss-' + 6 hex
  projectId: string;
  kind: IssueKind;
  title: string;
  body: string;
  status: IssueStatus;
  openedAt: number;
  openedInRunId: string | null;
  closedAt: number | null;
  closedInRunId: string | null;
}

// ── Store ──────────────────────────────────────────────────────────────────

export class IssueStore {
  private db: ReturnType<typeof Database>;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    // Reuse the same projects.db for locality
    this.db = Database(join(dataDir, 'projects.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_issues (
        id               TEXT    PRIMARY KEY,
        project_id       TEXT    NOT NULL,
        kind             TEXT    NOT NULL DEFAULT 'bug',
        title            TEXT    NOT NULL,
        body             TEXT    NOT NULL DEFAULT '',
        status           TEXT    NOT NULL DEFAULT 'open',
        opened_at        INTEGER NOT NULL,
        opened_in_run_id TEXT,
        closed_at        INTEGER,
        closed_in_run_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_issues_project_id ON project_issues (project_id);
      CREATE INDEX IF NOT EXISTS idx_issues_status     ON project_issues (status);
    `);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  createIssue(input: {
    projectId: string;
    kind: IssueKind;
    title: string;
    body?: string;
    runId?: string;
  }): ProjectIssue {
    const id  = 'iss-' + randomBytes(3).toString('hex');
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO project_issues (id, project_id, kind, title, body, status, opened_at, opened_in_run_id)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(id, input.projectId, input.kind, input.title, input.body ?? '', now, input.runId ?? null);
    return this.getIssue(id)!;
  }

  getIssue(id: string): ProjectIssue | undefined {
    const row = this.db.prepare('SELECT * FROM project_issues WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toIssue(row) : undefined;
  }

  listByProject(projectId: string): ProjectIssue[] {
    return (this.db.prepare(
      'SELECT * FROM project_issues WHERE project_id = ? ORDER BY opened_at DESC',
    ).all(projectId) as Record<string, unknown>[]).map(r => this.toIssue(r));
  }

  listOpen(projectId: string): ProjectIssue[] {
    return (this.db.prepare(
      "SELECT * FROM project_issues WHERE project_id = ? AND status IN ('open','in_progress') ORDER BY opened_at DESC",
    ).all(projectId) as Record<string, unknown>[]).map(r => this.toIssue(r));
  }

  updateStatus(id: string, status: IssueStatus): void {
    this.db.prepare('UPDATE project_issues SET status = ? WHERE id = ?').run(status, id);
  }

  setInProgress(id: string): void {
    this.updateStatus(id, 'in_progress');
  }

  close(id: string, runId?: string): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE project_issues SET status = 'closed', closed_at = ?, closed_in_run_id = COALESCE(?, closed_in_run_id) WHERE id = ?
    `).run(now, runId ?? null, id);
  }

  wontfix(id: string): void {
    this.updateStatus(id, 'wontfix');
  }

  reopen(id: string): void {
    this.db.prepare(`
      UPDATE project_issues SET status = 'open', closed_at = NULL, closed_in_run_id = NULL WHERE id = ?
    `).run(id);
  }

  closeDb(): void { this.db.close(); }

  // ── Row mapper ─────────────────────────────────────────────────────────────

  private toIssue(r: Record<string, unknown>): ProjectIssue {
    return {
      id:              r['id']               as string,
      projectId:       r['project_id']       as string,
      kind:            r['kind']             as IssueKind,
      title:           r['title']            as string,
      body:            r['body']             as string,
      status:          r['status']           as IssueStatus,
      openedAt:        r['opened_at']        as number,
      openedInRunId:   (r['opened_in_run_id']  as string | null) ?? null,
      closedAt:        (r['closed_at']         as number | null) ?? null,
      closedInRunId:   (r['closed_in_run_id']  as string | null) ?? null,
    };
  }
}
