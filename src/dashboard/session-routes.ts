/**
 * AI_DESK — Session History Routes
 *
 * All routes require dashboard auth (mounted after checkAuth).
 *
 *   GET  /dashboard/api/sessions            — metadata list (no transcript)
 *   GET  /dashboard/api/sessions/:id        — full session with transcript
 *   DELETE /dashboard/api/sessions/:id      — hard-delete (purge)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from '../sessions/session-store.js';

export class SessionRoutes {
  constructor(private store: SessionStore) {}

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/dashboard/api/sessions')) return false;
    res.setHeader('Content-Type', 'application/json');

    const parsedUrl  = new URL(req.url ?? '', `http://${req.headers.host}`);
    const sub = url.slice('/dashboard/api/sessions'.length) || '/';

    if (sub === '/' || sub === '') {
      if (req.method === 'GET') { this.listSessions(parsedUrl, res); return true; }
    }

    const idMatch = sub.match(/^\/([a-f0-9-]{8,})$/);
    if (idMatch) {
      if (req.method === 'GET')    { this.getSession(idMatch[1], res); return true; }
      if (req.method === 'DELETE') { this.deleteSession(idMatch[1], res); return true; }
    }

    return false;
  }

  private listSessions(url: URL, res: ServerResponse): void {
    const agentId = url.searchParams.get('agent')  ?? undefined;
    const state   = url.searchParams.get('state')  ?? undefined;
    const limit   = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 500);

    const sessions = this.store.listMeta({ agentId, state, limit });
    res.writeHead(200);
    res.end(JSON.stringify({ sessions }));
  }

  private getSession(id: string, res: ServerResponse): void {
    const session = this.store.get(id);
    if (!session) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ session }));
  }

  private deleteSession(id: string, res: ServerResponse): void {
    const ok = this.store.purge(id);
    res.writeHead(ok ? 200 : 404);
    res.end(JSON.stringify({ ok }));
  }
}
