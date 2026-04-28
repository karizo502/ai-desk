/**
 * AI_DESK — Dashboard Server
 *
 * Mounts three HTTP routes on the existing gateway HTTP server:
 *   GET /dashboard          — Self-contained SPA HTML
 *   GET /dashboard/events   — SSE stream (real-time events + periodic snapshot)
 *   GET /dashboard/api/snapshot — Instant JSON snapshot
 *
 * Wired in by calling handle(req, res) at the top of handleHttp().
 * Returns true when it handled the request so the caller can skip the rest.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDashboardHtml } from './dashboard-html.js';
import { getLoginHtml } from './login-html.js';
import { CredentialRoutes } from './credential-routes.js';
import { AgentRoutes, type ReloadFn } from './agent-routes.js';
import { TeamRoutes } from './team-routes.js';
import { ConfigManager } from './config-manager.js';
import { eventBus } from '../shared/events.js';
import type { CredentialStore } from '../auth/credential-store.js';
import type { AuthManager } from '../auth/auth-manager.js';

export interface AgentSnapshot {
  id: string;
  model: string;
  sessions: number;
  status: string;
}

export interface TeamSnapshot {
  id: string;
  name: string;
  leadAgentId: string;
  members: Array<{ agentId: string; roleId: string }>;
}

export interface BudgetSnapshot {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyCostUsed: number;
  monthlyCostLimit: number;
}

export interface SkillSnapshot {
  name: string;
  version: string;
  enabled: boolean;
  description: string;
}

export interface McpServerSnapshot {
  name: string;
  ready: boolean;
  tools: number;
}

export interface MessagingSnapshot {
  platform: string;
  running: boolean;
}

export interface ProviderSnapshot {
  name: string;
  available: boolean;
}

export interface DashboardSnapshot {
  timestamp: number;
  uptime: number;
  connections: number;
  agents: AgentSnapshot[];
  teams: TeamSnapshot[];
  budget: BudgetSnapshot;
  skills: SkillSnapshot[];
  mcpServers: McpServerSnapshot[];
  messaging: MessagingSnapshot[];
  providers: ProviderSnapshot[];
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

export class DashboardServer {
  private sseClients = new Set<ServerResponse>();
  private snapshotFn: () => DashboardSnapshot;
  private authManager: AuthManager;
  private snapshotInterval: ReturnType<typeof setInterval>;
  private credentialRoutes: CredentialRoutes | null = null;
  private agentRoutes: AgentRoutes | null = null;
  private teamRoutes: TeamRoutes | null = null;

  constructor(
    snapshotFn: () => DashboardSnapshot,
    authManager: AuthManager,
    credStore?: CredentialStore,
    opts?: { configPath?: string; onAgentReload?: ReloadFn },
  ) {
    this.snapshotFn = snapshotFn;
    this.authManager = authManager;
    if (credStore) this.credentialRoutes = new CredentialRoutes(credStore);
    if (opts?.configPath) {
      const cfg = new ConfigManager(opts.configPath);
      this.agentRoutes = new AgentRoutes(cfg, opts.onAgentReload);
      this.teamRoutes  = new TeamRoutes(cfg);
    }

    // Forward every gateway event to SSE clients
    eventBus.on('*', payload => {
      this.broadcast('event', payload);
    });

    // Push a full snapshot every 10 seconds so the UI stays fresh
    this.snapshotInterval = setInterval(() => {
      this.broadcast('snapshot', this.snapshotFn());
    }, 10_000);
  }

  /** Wire up the MessagingManager after it has been started by the gateway. */
  setMessagingManager(mgr: import('../messaging/messaging-manager.js').MessagingManager): void {
    this.credentialRoutes?.setMessagingManager(mgr);
  }

  /** Call from the gateway's handleHttp. Returns true if the request was handled. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '').split('?')[0];

    // GET /login is public
    if (url === '/login' || url === '/login/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getLoginHtml());
      return true;
    }

    // GET /dashboard is public (it serves the SPA which redirects to /login if no localStorage)
    if (url === '/dashboard' || url === '/dashboard/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(getDashboardHtml());
      return true;
    }

    // All other dashboard routes (/api/*, /events) require a valid token
    if (!this.checkAuth(req, res)) return true;

    if (this.credentialRoutes?.handle(req, res)) return true;
    if (this.agentRoutes?.handle(req, res)) return true;
    if (this.teamRoutes?.handle(req, res)) return true;

    if (url === '/dashboard' || url === '/dashboard/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(getDashboardHtml());
      return true;
    }

    if (url === '/dashboard/events') {
      this.handleSse(req, res);
      return true;
    }

    if (url === '/dashboard/api/snapshot') {
      const snapshot = this.snapshotFn();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snapshot, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Check for a valid auth token in the query string (?token=...) or x-ai-desk-token header.
   * Returns true if authenticated, otherwise returns false and sends 401.
   */
  private checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const remoteAddress = req.socket.remoteAddress ?? 'unknown';

    // 1. Check query param
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    let token = url.searchParams.get('token');

    // 2. Check header
    if (!token) {
      token = (req.headers['x-ai-desk-token'] as string) ?? '';
    }

    if (!token || !this.authManager.authenticateToken(token, remoteAddress).success) {
      const accept = req.headers.accept || '';
      if (req.method === 'GET' && accept.includes('text/html') && !url.pathname.includes('/api/')) {
        res.writeHead(302, { Location: '/login' });
        res.end();
        return false;
      }

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: !token ? 'Authentication required' : 'Invalid or expired token' }));
      return false;
    }

    return true;
  }

  destroy(): void {
    clearInterval(this.snapshotInterval);
    for (const res of this.sseClients) {
      if (!res.destroyed) res.end();
    }
    this.sseClients.clear();
  }

  // ─── SSE ─────────────────────────────────────────────────

  private handleSse(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, SSE_HEADERS);
    // Some proxies require an explicit flush
    if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
      (res as unknown as { flushHeaders: () => void }).flushHeaders();
    }

    this.sseClients.add(res);
    eventBus.emit('dashboard:client-connected', { total: this.sseClients.size });

    // Send the current snapshot immediately so the UI renders without waiting 10s
    this.sendSse(res, 'snapshot', this.snapshotFn());

    // Keep-alive heartbeat comment (not a data event — browsers ignore it)
    const hb = setInterval(() => {
      if (!res.destroyed) {
        res.write(':heartbeat\n\n');
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(hb);
      this.sseClients.delete(res);
      eventBus.emit('dashboard:client-disconnected', { total: this.sseClients.size });
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  }

  private broadcast(eventName: string, data: unknown): void {
    const dead: ServerResponse[] = [];
    for (const res of this.sseClients) {
      if (res.destroyed) {
        dead.push(res);
      } else {
        this.sendSse(res, eventName, data);
      }
    }
    for (const res of dead) this.sseClients.delete(res);
  }

  private sendSse(res: ServerResponse, eventName: string, data: unknown): void {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected mid-write; will be cleaned up on next broadcast
    }
  }
}
