/**
 * AI_DESK — Workspace HTTP Routes
 *
 * Routes:
 *   GET    /dashboard/api/workspace        — full snapshot (tasks, agents, teams)
 *   DELETE /dashboard/api/workspace/clear  — reset history
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WorkspaceTracker } from './workspace-tracker.js';

export class WorkspaceRoutes {
  private tracker: WorkspaceTracker;

  constructor(tracker: WorkspaceTracker) {
    this.tracker = tracker;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = req.method?.toUpperCase() ?? 'GET';

    if (url === '/dashboard/api/workspace' && method === 'GET') {
      this.json(res, this.tracker.snapshot());
      return true;
    }

    if (url === '/dashboard/api/workspace/clear' && method === 'DELETE') {
      this.tracker.clear();
      this.json(res, { ok: true });
      return true;
    }

    return false;
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}
