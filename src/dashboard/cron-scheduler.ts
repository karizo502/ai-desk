/**
 * AI_DESK — Cron Scheduler
 *
 * Parses 5-field cron expressions and fires agent jobs on schedule.
 * Uses a 30-second polling interval — precision is ±30s, which is sufficient
 * for all practical scheduled-task use cases.
 *
 * Cron format: minute hour dom month dow
 *   * = any,  n = exact,  n-m = range,  n,m = list,  *\/n = every-n
 *
 * DOM/DOW semantics: when both are restricted (not *), uses OR (classic cron).
 */
import type { CronStore, CronJob } from './cron-store.js';
import { eventBus } from '../shared/events.js';

export type CronTriggerFn = (agentId: string, prompt: string) => Promise<{ content: string }>;

// ─── Parser ────────────────────────────────────────────────────

function parseField(part: string, min: number, max: number): Set<number> | null {
  const result = new Set<number>();
  for (const seg of part.split(',')) {
    if (seg === '*') {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (/^\*\/\d+$/.test(seg)) {
      const step = parseInt(seg.slice(2), 10);
      if (step < 1) return null;
      for (let i = min; i <= max; i += step) result.add(i);
    } else if (/^\d+-\d+$/.test(seg)) {
      const [lo, hi] = seg.split('-').map(Number);
      for (let i = Math.max(lo, min); i <= Math.min(hi, max); i++) result.add(i);
    } else if (/^\d+$/.test(seg)) {
      const n = parseInt(seg, 10);
      if (n >= min && n <= max) result.add(n);
    } else {
      return null;
    }
  }
  return result.size > 0 ? result : null;
}

/**
 * Returns the next Date >= (after + 1 min) that matches the cron expression,
 * or null if the expression is invalid or no match within 2 years.
 */
export function nextCronDate(expr: string, after: Date): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const mins = parseField(parts[0], 0, 59);
  const hrs  = parseField(parts[1], 0, 23);
  const doms = parseField(parts[2], 1, 31);
  const mons = parseField(parts[3], 1, 12);
  const dows = parseField(parts[4], 0, 6);
  if (!mins || !hrs || !doms || !mons || !dows) return null;

  const domRestricted = parts[2] !== '*';
  const dowRestricted = parts[4] !== '*';

  const start = new Date(after.getTime() + 60_000);
  start.setSeconds(0, 0);
  const limit = new Date(start.getTime() + 2 * 366 * 24 * 60 * 60 * 1000);

  let cur = start;
  while (cur < limit) {
    const mo  = cur.getMonth() + 1; // 1-12
    const dom = cur.getDate();      // 1-31
    const dow = cur.getDay();       // 0-6
    const hr  = cur.getHours();
    const mn  = cur.getMinutes();

    if (!mons.has(mo)) {
      const nm = mo === 12 ? 1 : mo + 1;
      const ny = mo === 12 ? cur.getFullYear() + 1 : cur.getFullYear();
      cur = new Date(ny, nm - 1, 1, 0, 0, 0, 0);
      continue;
    }

    // Classic cron OR when both restricted, else only the restricted field matters
    const dayOk = (domRestricted && dowRestricted)
      ? (doms.has(dom) || dows.has(dow))
      : (domRestricted ? doms.has(dom) : dows.has(dow));

    if (!dayOk) {
      cur = new Date(cur.getFullYear(), cur.getMonth(), dom + 1, 0, 0, 0, 0);
      continue;
    }

    if (!hrs.has(hr)) {
      cur = new Date(cur.getFullYear(), cur.getMonth(), dom, hr + 1, 0, 0, 0);
      continue;
    }

    if (!mins.has(mn)) {
      cur = new Date(cur.getTime() + 60_000);
      continue;
    }

    return cur;
  }
  return null;
}

/** Validate a cron expression — returns null if valid, error string if not. */
export function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Expected 5 fields: minute hour dom month dow';
  if (!parseField(parts[0], 0, 59)) return 'Invalid minute field';
  if (!parseField(parts[1], 0, 23)) return 'Invalid hour field';
  if (!parseField(parts[2], 1, 31)) return 'Invalid day-of-month field';
  if (!parseField(parts[3], 1, 12)) return 'Invalid month field';
  if (!parseField(parts[4], 0, 6))  return 'Invalid day-of-week field';
  if (!nextCronDate(expr, new Date())) return 'Expression produces no future dates';
  return null;
}

// ─── Scheduler ────────────────────────────────────────────────

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>(); // job IDs currently executing

  constructor(
    private store: CronStore,
    private triggerFn: CronTriggerFn,
    private checkIntervalMs = 30_000,
  ) {}

  start(): void {
    // Recompute nextRunAt for every enabled job from now (skip missed runs)
    for (const job of this.store.list()) {
      if (job.enabled) {
        const next = nextCronDate(job.schedule, new Date());
        this.store.setNextRun(job.id, next ? next.getTime() : null);
      } else {
        this.store.setNextRun(job.id, null);
      }
    }
    this.timer = setInterval(() => void this.tick(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Trigger a job immediately, regardless of schedule. */
  async runNow(id: string): Promise<{ ok: boolean; content?: string; error?: string }> {
    const job = this.store.get(id);
    if (!job) return { ok: false, error: 'Job not found' };
    return this.executeJob(job);
  }

  /** Recompute nextRunAt after a create or update. */
  reschedule(id: string): void {
    const job = this.store.get(id);
    if (!job || !job.enabled) { this.store.setNextRun(id, null); return; }
    const next = nextCronDate(job.schedule, new Date());
    this.store.setNextRun(id, next ? next.getTime() : null);
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const due = this.store.list().filter(j =>
      j.enabled &&
      j.nextRunAt !== null &&
      j.nextRunAt <= now &&
      !this.running.has(j.id),
    );
    if (!due.length) return;
    await Promise.allSettled(due.map(job => this.executeJob(job)));
  }

  private async executeJob(job: CronJob): Promise<{ ok: boolean; content?: string; error?: string }> {
    this.running.add(job.id);
    eventBus.emit('cron:triggered', { jobId: job.id, agentId: job.agentId, name: job.name });
    try {
      const result = await this.triggerFn(job.agentId, job.prompt);
      const next   = nextCronDate(job.schedule, new Date());
      this.store.recordRun(job.id, 'ok', result.content, next ? next.getTime() : null);
      eventBus.emit('cron:completed', { jobId: job.id, agentId: job.agentId });
      return { ok: true, content: result.content };
    } catch (err) {
      const msg  = (err as Error).message;
      const next = nextCronDate(job.schedule, new Date());
      this.store.recordRun(job.id, 'error', msg, next ? next.getTime() : null);
      eventBus.emit('cron:failed', { jobId: job.id, agentId: job.agentId, error: msg });
      return { ok: false, error: msg };
    } finally {
      this.running.delete(job.id);
    }
  }
}
