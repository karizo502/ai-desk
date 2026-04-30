/**
 * AI_DESK — Webhook Routes
 *
 * Two sets of routes:
 *   handlePublic(req, res)  — POST /webhook/:id   (no dashboard auth — uses webhook secret)
 *   handle(req, res)        — /dashboard/api/webhooks/* (dashboard auth required)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebhookStore } from './webhook-store.js';
import { eventBus } from '../shared/events.js';

export type WebhookTriggerFn = (agentId: string, prompt: string) => Promise<{ content: string }>;

export class WebhookRoutes {
  constructor(
    private store: WebhookStore,
    private triggerFn: WebhookTriggerFn,
    private baseUrl: string,
  ) {}

  /** Called BEFORE dashboard auth check. Returns true if handled. */
  handlePublic(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '').split('?')[0];
    const m = url.match(/^\/webhook\/([a-f0-9]{16})$/);
    if (!m) return false;

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed — use POST' }));
      return true;
    }

    void this.handleTrigger(m[1], req, res);
    return true;
  }

  /** Called AFTER dashboard auth check. Returns true if handled. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/dashboard/api/webhooks')) return false;
    res.setHeader('Content-Type', 'application/json');

    const sub = url.slice('/dashboard/api/webhooks'.length) || '/';

    if (sub === '/' || sub === '') {
      if (req.method === 'GET') { this.listWebhooks(res); return true; }
      if (req.method === 'POST') { void this.createWebhook(req, res); return true; }
    }

    const idMatch = sub.match(/^\/([a-f0-9]{16})$/);
    if (idMatch) {
      if (req.method === 'DELETE') { this.deleteWebhook(idMatch[1], res); return true; }
    }

    return false;
  }

  // ─── CRUD ───────────────────────────────────────────────────

  private listWebhooks(res: ServerResponse): void {
    const webhooks = this.store.list().map(w => ({
      id: w.id,
      name: w.name,
      agentId: w.agentId,
      promptTemplate: w.promptTemplate,
      enabled: w.enabled,
      createdAt: w.createdAt,
      lastTriggeredAt: w.lastTriggeredAt,
      triggerCount: w.triggerCount,
      url: `${this.baseUrl}/webhook/${w.id}`,
      // Secret is included so user can copy it from dashboard
      secret: w.secret,
    }));
    res.writeHead(200);
    res.end(JSON.stringify({ webhooks }));
  }

  private async createWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let parsed: { name?: string; agentId?: string; promptTemplate?: string };
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { name, agentId, promptTemplate } = parsed;
    if (!name || !agentId || !promptTemplate) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'name, agentId and promptTemplate are required' }));
      return;
    }

    const wh = this.store.create({ name, agentId, promptTemplate });
    res.writeHead(201);
    res.end(JSON.stringify({
      ok: true,
      webhook: {
        ...wh,
        url: `${this.baseUrl}/webhook/${wh.id}`,
      },
    }));
  }

  private deleteWebhook(id: string, res: ServerResponse): void {
    const ok = this.store.delete(id);
    res.writeHead(ok ? 200 : 404);
    res.end(JSON.stringify({ ok }));
  }

  // ─── Trigger ────────────────────────────────────────────────

  private async handleTrigger(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    let body: string;
    try {
      body = await readBody(req, 1_048_576); // 1 MB max
    } catch {
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'Payload too large' }));
      return;
    }

    const signature   = req.headers['x-ai-desk-signature'] as string | undefined;
    const authHeader  = req.headers['authorization'] as string | undefined;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!this.store.verifySecret(id, body, signature, bearerToken)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Invalid or missing webhook secret' }));
      return;
    }

    const wh = this.store.get(id)!;
    const prompt = wh.promptTemplate.replace(/\{\{body\}\}/g, body);

    this.store.recordTrigger(id);
    eventBus.emit('webhook:triggered', { webhookId: id, agentId: wh.agentId, bodyLength: body.length });

    try {
      const result = await this.triggerFn(wh.agentId, prompt);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, result: result.content, webhookId: id, agentId: wh.agentId }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
    }
  }
}

function readBody(req: IncomingMessage, maxBytes = 10_485_760): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { reject(new Error('too large')); return; }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
