/**
 * AI_DESK — Per-Agent Connection Routes
 *
 * All routes require dashboard auth (mounted after checkAuth).
 *
 *   GET    /dashboard/api/connections              — list (no tokens)
 *   POST   /dashboard/api/connections              — create
 *   DELETE /dashboard/api/connections/:id          — remove (disconnects first)
 *   POST   /dashboard/api/connections/:id/connect  — start adapter
 *   POST   /dashboard/api/connections/:id/disconnect — stop adapter
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConnectionStore } from './connection-store.js';
import type { MessagingManager } from '../messaging/messaging-manager.js';

export class ConnectionRoutes {
  private mgr: MessagingManager | null = null;

  constructor(private store: ConnectionStore) {}

  setMessagingManager(mgr: MessagingManager): void {
    this.mgr = mgr;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = req.method?.toUpperCase() ?? 'GET';

    if (!url.startsWith('/dashboard/api/connections')) return false;
    res.setHeader('Content-Type', 'application/json');

    const sub = url.slice('/dashboard/api/connections'.length) || '/';

    // Collection
    if (sub === '/' || sub === '') {
      if (method === 'GET')  { this.list(res); return true; }
      if (method === 'POST') { this.withBody(req, body => void this.create(res, body)); return true; }
    }

    // Action routes
    const actionMatch = sub.match(/^\/([a-f0-9]{12})\/(connect|disconnect)$/);
    if (actionMatch) {
      const [, id, action] = actionMatch;
      if (method === 'POST' && action === 'connect')    { void this.connect(res, id); return true; }
      if (method === 'POST' && action === 'disconnect') { void this.disconnect(res, id); return true; }
    }

    // Resource
    const idMatch = sub.match(/^\/([a-f0-9]{12})$/);
    if (idMatch) {
      if (method === 'DELETE') { void this.remove(res, idMatch[1]); return true; }
    }

    return false;
  }

  // ─── handlers ───────────────────────────────────────────────────────────────

  private list(res: ServerResponse): void {
    const connections = this.store.list();
    // Enrich with live running state
    const running = this.mgr?.listNamedConnections() ?? {};
    const enriched = connections.map(c => ({ ...c, running: running[c.id] ?? false }));
    res.writeHead(200);
    res.end(JSON.stringify({ connections: enriched }));
  }

  private async create(res: ServerResponse, body: unknown): Promise<void> {
    const b = body as Record<string, unknown>;
    const label    = (b['label'] ?? '').toString().trim();
    const platform = b['platform'] as string;
    const agentId  = (b['agentId'] ?? '').toString().trim();
    const token    = (b['token'] ?? '').toString().trim();

    if (!label)                                    { this.error(res, 400, 'label is required'); return; }
    if (platform !== 'telegram' && platform !== 'discord') { this.error(res, 400, 'platform must be telegram or discord'); return; }
    if (!agentId)                                  { this.error(res, 400, 'agentId is required'); return; }
    if (!token)                                    { this.error(res, 400, 'token is required'); return; }

    const conn = this.store.create({ label, platform, agentId, token });
    res.writeHead(201);
    res.end(JSON.stringify({ connection: { ...conn, running: false } }));
  }

  private async connect(res: ServerResponse, id: string): Promise<void> {
    const full = this.store.getFull(id);
    if (!full) { this.error(res, 404, 'Connection not found'); return; }
    if (!this.mgr) { this.error(res, 503, 'Messaging manager not available'); return; }

    try {
      const { botUsername } = await this.mgr.startNamedConnection(id, full.platform, full.token, full.agentId);
      this.store.setConnected(id, botUsername ?? null);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, botUsername }));
    } catch (err) {
      this.error(res, 400, (err as Error).message ?? 'Connection failed');
    }
  }

  private async disconnect(res: ServerResponse, id: string): Promise<void> {
    if (!this.store.get(id)) { this.error(res, 404, 'Connection not found'); return; }
    if (!this.mgr) { this.error(res, 503, 'Messaging manager not available'); return; }

    await this.mgr.stopNamedConnection(id);
    this.store.clearConnected(id);
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
  }

  private async remove(res: ServerResponse, id: string): Promise<void> {
    if (!this.store.get(id)) { this.error(res, 404, 'Connection not found'); return; }
    // Disconnect first if running
    if (this.mgr) await this.mgr.stopNamedConnection(id);
    const ok = this.store.delete(id);
    res.writeHead(200);
    res.end(JSON.stringify({ ok }));
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private withBody(req: IncomingMessage, handler: (body: unknown) => void): void {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { handler(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch { handler({}); }
    });
  }

  private error(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status);
    res.end(JSON.stringify({ error: message }));
  }
}
