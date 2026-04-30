/**
 * AI_DESK — Cron Routes
 *
 * All routes require dashboard auth (mounted after checkAuth).
 *
 *   GET    /dashboard/api/cron           — list jobs
 *   POST   /dashboard/api/cron           — create job
 *   PUT    /dashboard/api/cron/:id       — update job (partial patch)
 *   DELETE /dashboard/api/cron/:id       — delete job
 *   POST   /dashboard/api/cron/:id/run   — trigger immediately
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CronStore } from './cron-store.js';
import type { CronScheduler } from './cron-scheduler.js';
import { validateCron } from './cron-scheduler.js';

export class CronRoutes {
  constructor(
    private store: CronStore,
    private scheduler: CronScheduler,
  ) {}

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/dashboard/api/cron')) return false;
    res.setHeader('Content-Type', 'application/json');

    const sub = url.slice('/dashboard/api/cron'.length) || '/';

    // Collection
    if (sub === '/' || sub === '') {
      if (req.method === 'GET')  { this.listJobs(res); return true; }
      if (req.method === 'POST') { void this.createJob(req, res); return true; }
    }

    // Single item: /dashboard/api/cron/:id
    const idMatch = sub.match(/^\/([a-f0-9]{12})$/);
    if (idMatch) {
      if (req.method === 'PUT')    { void this.updateJob(idMatch[1], req, res); return true; }
      if (req.method === 'DELETE') { this.deleteJob(idMatch[1], res); return true; }
    }

    // Manual trigger: /dashboard/api/cron/:id/run
    const runMatch = sub.match(/^\/([a-f0-9]{12})\/run$/);
    if (runMatch && req.method === 'POST') {
      void this.runNow(runMatch[1], res);
      return true;
    }

    return false;
  }

  // ─── Handlers ───────────────────��─────────────────────────

  private listJobs(res: ServerResponse): void {
    res.writeHead(200);
    res.end(JSON.stringify({ jobs: this.store.list() }));
  }

  private async createJob(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let parsed: { name?: string; agentId?: string; prompt?: string; schedule?: string };
    try { parsed = JSON.parse(await readBody(req)); }
    catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

    const { name, agentId, prompt, schedule } = parsed;
    if (!name || !agentId || !prompt || !schedule) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'name, agentId, prompt and schedule are required' }));
      return;
    }

    const cronErr = validateCron(schedule);
    if (cronErr) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Invalid cron expression: ${cronErr}` }));
      return;
    }

    const job = this.store.create({ name, agentId, prompt, schedule });
    this.scheduler.reschedule(job.id);
    // Return fresh job with computed nextRunAt
    res.writeHead(201);
    res.end(JSON.stringify({ ok: true, job: this.store.get(job.id) }));
  }

  private async updateJob(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const job = this.store.get(id);
    if (!job) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }

    let parsed: Partial<{ name: string; agentId: string; prompt: string; schedule: string; enabled: boolean }>;
    try { parsed = JSON.parse(await readBody(req)); }
    catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

    if (parsed.schedule !== undefined) {
      const cronErr = validateCron(parsed.schedule);
      if (cronErr) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `Invalid cron expression: ${cronErr}` }));
        return;
      }
    }

    this.store.update(id, parsed);
    this.scheduler.reschedule(id);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, job: this.store.get(id) }));
  }

  private deleteJob(id: string, res: ServerResponse): void {
    const ok = this.store.delete(id);
    res.writeHead(ok ? 200 : 404);
    res.end(JSON.stringify({ ok }));
  }

  private async runNow(id: string, res: ServerResponse): Promise<void> {
    const result = await this.scheduler.runNow(id);
    res.writeHead(result.ok ? 200 : (result.error === 'Job not found' ? 404 : 500));
    res.end(JSON.stringify(result));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
