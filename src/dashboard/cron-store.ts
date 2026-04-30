/**
 * AI_DESK — Cron Store
 *
 * Persists scheduled job definitions in SQLite.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export interface CronJob {
  id: string;
  name: string;
  agentId: string;
  prompt: string;
  schedule: string;        // 5-field cron expression
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastResult: string | null;
  lastStatus: 'ok' | 'error' | null;
  runCount: number;
}

export class CronStore {
  private db: ReturnType<typeof Database>;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = Database(join(dataDir, 'cron.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id           TEXT    PRIMARY KEY,
        name         TEXT    NOT NULL,
        agent_id     TEXT    NOT NULL,
        prompt       TEXT    NOT NULL,
        schedule     TEXT    NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1,
        created_at   INTEGER NOT NULL,
        last_run_at  INTEGER,
        next_run_at  INTEGER,
        last_result  TEXT,
        last_status  TEXT,
        run_count    INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  create(input: { name: string; agentId: string; prompt: string; schedule: string }): CronJob {
    const id  = randomBytes(6).toString('hex');
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO cron_jobs (id, name, agent_id, prompt, schedule, enabled, created_at, run_count)
      VALUES (?, ?, ?, ?, ?, 1, ?, 0)
    `).run(id, input.name, input.agentId, input.prompt, input.schedule, now);
    return this.get(id)!;
  }

  get(id: string): CronJob | undefined {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toJob(row) : undefined;
  }

  list(): CronJob[] {
    return (this.db.prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(r => this.toJob(r));
  }

  update(id: string, patch: Partial<Pick<CronJob, 'name' | 'agentId' | 'prompt' | 'schedule' | 'enabled'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name     !== undefined) { fields.push('name = ?');     values.push(patch.name); }
    if (patch.agentId  !== undefined) { fields.push('agent_id = ?'); values.push(patch.agentId); }
    if (patch.prompt   !== undefined) { fields.push('prompt = ?');   values.push(patch.prompt); }
    if (patch.schedule !== undefined) { fields.push('schedule = ?'); values.push(patch.schedule); }
    if (patch.enabled  !== undefined) { fields.push('enabled = ?');  values.push(patch.enabled ? 1 : 0); }
    if (!fields.length) return;
    values.push(id);
    this.db.prepare(`UPDATE cron_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id).changes > 0;
  }

  recordRun(id: string, status: 'ok' | 'error', result: string, nextRunAt: number | null): void {
    this.db.prepare(`
      UPDATE cron_jobs
      SET last_run_at = ?, last_status = ?, last_result = ?, next_run_at = ?, run_count = run_count + 1
      WHERE id = ?
    `).run(Date.now(), status, result.slice(0, 2000), nextRunAt, id);
  }

  setNextRun(id: string, nextRunAt: number | null): void {
    this.db.prepare('UPDATE cron_jobs SET next_run_at = ? WHERE id = ?').run(nextRunAt, id);
  }

  close(): void { this.db.close(); }

  private toJob(row: Record<string, unknown>): CronJob {
    return {
      id:         row['id']          as string,
      name:       row['name']        as string,
      agentId:    row['agent_id']    as string,
      prompt:     row['prompt']      as string,
      schedule:   row['schedule']    as string,
      enabled:    Boolean(row['enabled']),
      createdAt:  row['created_at']  as number,
      lastRunAt:  (row['last_run_at']  as number | null) ?? null,
      nextRunAt:  (row['next_run_at']  as number | null) ?? null,
      lastResult: (row['last_result']  as string | null) ?? null,
      lastStatus: (row['last_status']  as 'ok' | 'error' | null) ?? null,
      runCount:   row['run_count']   as number,
    };
  }
}
