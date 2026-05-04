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
import { WebhookRoutes, type WebhookTriggerFn } from './webhook-routes.js';
import { WebhookStore } from './webhook-store.js';
import { CronRoutes } from './cron-routes.js';
import type { CronStore } from './cron-store.js';
import type { CronScheduler } from './cron-scheduler.js';
import { SessionRoutes } from './session-routes.js';
import type { SessionStore } from '../sessions/session-store.js';
import { ConnectionRoutes } from './connection-routes.js';
import { ProjectRoutes } from './project-routes.js';
import type { ConnectionStore } from './connection-store.js';
import { eventBus } from '../shared/events.js';
import type { CredentialStore } from '../auth/credential-store.js';
import type { AuthManager } from '../auth/auth-manager.js';
import type { AuditLog } from '../security/audit-log.js';
import { WorkspaceTracker } from '../workspace/workspace-tracker.js';
import { WorkspaceRoutes } from '../workspace/workspace-routes.js';
import type { ProjectStore } from '../projects/project-store.js';
import type { IssueStore } from '../projects/issue-store.js';
import type { TeamCoordinator } from '../roles/team-coordinator.js';

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
  private webhookRoutes: WebhookRoutes | null = null;
  private cronRoutes: CronRoutes | null = null;
  private sessionRoutes: SessionRoutes | null = null;
  private connectionRoutes: ConnectionRoutes | null = null;
  private projectRoutes: ProjectRoutes | null = null;
  private auditLog: AuditLog | null = null;
  private workspaceTracker: WorkspaceTracker;
  private workspaceRoutes: WorkspaceRoutes;

  constructor(
    snapshotFn: () => DashboardSnapshot,
    authManager: AuthManager,
    credStore?: CredentialStore,
    opts?: {
      configPath?: string;
      onAgentReload?: ReloadFn;
      auditLog?: AuditLog;
      webhookStore?: WebhookStore;
      onWebhookTrigger?: WebhookTriggerFn;
      baseUrl?: string;
      cronStore?: CronStore;
      cronScheduler?: CronScheduler;
      sessionStore?: SessionStore;
      connectionStore?: ConnectionStore;
      projectStore?: ProjectStore;
      issueStore?: IssueStore;
      teamCoordinator?: TeamCoordinator;
    },
  ) {
    this.snapshotFn = snapshotFn;
    this.authManager = authManager;
    this.workspaceTracker = new WorkspaceTracker();
    this.workspaceRoutes  = new WorkspaceRoutes(this.workspaceTracker);
    // Push workspace snapshot over SSE whenever any task or agent state changes
    this.workspaceTracker.onChange = () => {
      this.broadcast('workspace:update', this.workspaceTracker.snapshot());
    };
    if (credStore) this.credentialRoutes = new CredentialRoutes(credStore);
    if (opts?.auditLog) this.auditLog = opts.auditLog;
    if (opts?.configPath) {
      const cfg = new ConfigManager(opts.configPath);
      this.agentRoutes = new AgentRoutes(cfg, opts.onAgentReload);
      this.teamRoutes  = new TeamRoutes(cfg);
    }
    if (opts?.webhookStore && opts?.onWebhookTrigger) {
      this.webhookRoutes = new WebhookRoutes(
        opts.webhookStore,
        opts.onWebhookTrigger,
        opts.baseUrl ?? 'http://127.0.0.1:18789',
      );
    }
    if (opts?.cronStore && opts?.cronScheduler) {
      this.cronRoutes = new CronRoutes(opts.cronStore, opts.cronScheduler);
    }
    if (opts?.sessionStore) {
      this.sessionRoutes = new SessionRoutes(opts.sessionStore);
    }
    if (opts?.connectionStore) {
      this.connectionRoutes = new ConnectionRoutes(opts.connectionStore);
    }
    if (opts?.projectStore) {
      this.projectRoutes = new ProjectRoutes(
        opts.projectStore,
        opts.issueStore ?? null,
        opts.teamCoordinator ?? null,
      );
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

  /** Expose tracker so gateway can wire up WS push in Task #4. */
  get tracker(): WorkspaceTracker { return this.workspaceTracker; }

  /** Wire up the MessagingManager after it has been started by the gateway. */
  setMessagingManager(mgr: import('../messaging/messaging-manager.js').MessagingManager): void {
    this.credentialRoutes?.setMessagingManager(mgr);
    this.connectionRoutes?.setMessagingManager(mgr);
  }

  setTeamCoordinator(teamCoordinator: TeamCoordinator | null): void {
    this.projectRoutes?.setTeamCoordinator(teamCoordinator);
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

    // Favicon — no auth required
    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // POST /webhook/:id — public trigger (auth via webhook secret, not dashboard token)
    if (this.webhookRoutes?.handlePublic(req, res)) return true;

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
    if (this.projectRoutes?.handle(req, res)) return true;
    if (this.workspaceRoutes.handle(req, res)) return true;
    if (this.webhookRoutes?.handle(req, res)) return true;
    if (this.cronRoutes?.handle(req, res)) return true;
    if (this.sessionRoutes?.handle(req, res)) return true;
    if (this.connectionRoutes?.handle(req, res)) return true;

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

    if (url.startsWith('/dashboard/api/audit')) {
      this.handleAuditApi(req, res);
      return true;
    }

    return false;
  }

  /**
   * Check for a valid auth token in the Authorization header, query string (?token=...), or x-ai-desk-token header.
   * Returns true if authenticated, otherwise returns false and sends 401.
   */
  private checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const remoteAddress = req.socket.remoteAddress ?? 'unknown';
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);

    let token = '';

    // 1. Check Authorization header (Bearer token)
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // 2. Check query param
    if (!token) {
      token = url.searchParams.get('token') ?? '';
    }

    // 3. Check legacy header
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

  private handleAuditApi(req: IncomingMessage, res: ServerResponse): void {
    const parsedUrl = new URL(req.url ?? '', `http://${req.headers.host}`);
    const sub = parsedUrl.pathname.replace('/dashboard/api/audit', '') || '/';

    res.setHeader('Content-Type', 'application/json');

    if (sub === '/verify') {
      if (!this.auditLog) {
        res.writeHead(200);
        res.end(JSON.stringify({ valid: true, totalEntries: 0, note: 'AuditLog not wired' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(this.auditLog.verifyIntegrity()));
      return;
    }

    // GET /dashboard/api/audit?limit=&event=&search=
    if (!this.auditLog) {
      res.writeHead(200);
      res.end(JSON.stringify({ entries: [], total: 0 }));
      return;
    }

    const limit  = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '100', 10), 500);
    const event  = parsedUrl.searchParams.get('event') ?? undefined;
    const search = (parsedUrl.searchParams.get('search') ?? '').toLowerCase().trim();

    let entries = this.auditLog.recent(limit, event as never);

    if (search) {
      entries = entries.filter(e =>
        e.actor.toLowerCase().includes(search) ||
        (e.target ?? '').toLowerCase().includes(search) ||
        (e.detail ?? '').toLowerCase().includes(search) ||
        e.event.toLowerCase().includes(search),
      );
    }

    res.writeHead(200);
    res.end(JSON.stringify({ entries, total: entries.length }));
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
