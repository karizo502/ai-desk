/**
 * AI_DESK — Gateway Server
 *
 * Security-hardened WebSocket + HTTP server.
 * Binds to 127.0.0.1 by default. Auth is mandatory.
 *
 * Phase 2: handleChatMessage delegates to AgentRuntime which runs the full
 * model loop (cache → budget → router → tools → sandbox), streaming progress
 * events back to the client as chat:stream:delta messages.
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AuthManager } from '../auth/auth-manager.js';
import { CredentialStore } from '../auth/credential-store.js';
import { AuditLog } from '../security/audit-log.js';
import { ThreatDetector } from '../security/threat-detector.js';
import { AuditEngine } from '../security/audit-engine.js';
import { SessionStore } from '../sessions/session-store.js';
import { PolicyEngine } from '../tools/policy-engine.js';
import { SandboxManager } from '../tools/sandbox-interface.js';
import { ModelRouter } from '../models/model-router.js';
import { BudgetTracker } from '../budget/budget-tracker.js';
import { ResponseCache } from '../cache/response-cache.js';
import { ContextCompactor } from '../agents/compactor.js';
import { ToolRegistry } from '../agents/tool-registry.js';
import { ToolExecutor } from '../agents/tool-executor.js';
import { SubagentSpawner } from '../agents/subagent-spawner.js';
import { AgentRuntime, type AgentProgressEvent } from '../agents/agent-runtime.js';
import { McpRegistry } from '../mcp/mcp-registry.js';
import { McpToolAdapter } from '../mcp/mcp-tool-adapter.js';
import { Orchestrator } from '../orchestration/orchestrator.js';
import { MessagingManager } from '../messaging/messaging-manager.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { DashboardServer, type DashboardSnapshot } from '../dashboard/dashboard-server.js';
import { TeamCoordinator } from '../roles/team-coordinator.js';
import { eventBus } from '../shared/events.js';
import { loadConfig } from '../config/config-loader.js';
import { parseMessage, createMessage, type ProtocolMessage } from './protocol.js';
import { v4 as uuid } from 'uuid';
import type { ConnectionMeta } from '../shared/types.js';
import type { AiDeskConfig } from '../config/schema.js';

const APPROVAL_TIMEOUT_MS = 60_000;

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  connectionId: string;
}

export class GatewayServer {
  private config: AiDeskConfig;
  private httpServer: ReturnType<typeof createServer>;
  private wss!: WebSocketServer;
  private authManager: AuthManager;
  private credentialStore: CredentialStore;
  private auditLog: AuditLog;
  private threatDetector: ThreatDetector;
  private sessionStore: SessionStore;
  readonly policyEngine: PolicyEngine;
  private sandboxManager: SandboxManager;
  private modelRouter: ModelRouter;
  private budgetTracker: BudgetTracker;
  private responseCache: ResponseCache;
  private compactor: ContextCompactor;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private subagentSpawner: SubagentSpawner;
  private agentRuntime: AgentRuntime;
  private mcpRegistry: McpRegistry | null = null;
  private orchestrator: Orchestrator;
  private messagingManager: MessagingManager | null = null;
  private skillRegistry: SkillRegistry;
  private dashboardServer: DashboardServer;
  private teamCoordinator: TeamCoordinator | null = null;
  private mcpServerStatuses: Array<{ name: string; ready: boolean; tools: number }> = [];
  private messagingStatuses: Array<{ platform: string; running: boolean }> = [];
  private connections = new Map<string, { ws: WebSocket; meta: ConnectionMeta }>();
  private startTime = Date.now();
  private rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private cachePurgeInterval: ReturnType<typeof setInterval>;

  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? 'ai-desk.json';
    const { config, warnings } = loadConfig(configPath);
    this.config = config;

    for (const w of warnings) {
      console.warn(`⚠️  ${w}`);
    }

    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';

    if (!masterKey) {
      console.error('❌ AI_DESK_MASTER_KEY is required. Set it in .env or environment.');
      process.exit(1);
    }

    // Phase 1 subsystems
    this.authManager = new AuthManager(config.gateway.auth, dataDir, masterKey);
    this.credentialStore = new CredentialStore(dataDir, masterKey);
    this.auditLog = new AuditLog(dataDir);
    this.threatDetector = new ThreatDetector();
    this.sessionStore = new SessionStore(dataDir, masterKey);
    this.policyEngine = new PolicyEngine(config.agents.defaults.tools);
    this.sandboxManager = new SandboxManager(config.agents.defaults.sandbox);

    // Phase 2 subsystems
    this.budgetTracker = new BudgetTracker(dataDir, config.agents.defaults.budget);
    this.responseCache = new ResponseCache(
      dataDir,
      masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 },
    );
    this.modelRouter = new ModelRouter(
      config.agents.defaults.model,
      config.agents.defaults.subagents.model,
      this.credentialStore,
    );
    this.compactor = new ContextCompactor(
      this.modelRouter,
      config.memory ?? {
        backend: 'none',
        compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
      },
    );
    this.toolRegistry = new ToolRegistry();
    this.toolExecutor = new ToolExecutor({
      policy: this.policyEngine,
      registry: this.toolRegistry,
      sandbox: this.sandboxManager,
      threat: this.threatDetector,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: (req) => this.requestApprovalFromActiveClient(req),
    });
    this.subagentSpawner = new SubagentSpawner({
      router: this.modelRouter,
      executor: this.toolExecutor,
      budget: this.budgetTracker,
      compactor: this.compactor,
      policy: this.policyEngine,
      defaults: config.agents.defaults.subagents,
    });
    this.agentRuntime = new AgentRuntime({
      router: this.modelRouter,
      cache: this.responseCache,
      budget: this.budgetTracker,
      compactor: this.compactor,
      executor: this.toolExecutor,
      subagents: this.subagentSpawner,
      sessions: this.sessionStore,
      threat: this.threatDetector,
      defaults: config.agents.defaults,
      agents: config.agents.list,
    });

    this.orchestrator = new Orchestrator(this.agentRuntime);
    this.skillRegistry = new SkillRegistry(dataDir);

    // Team coordinator — wired after start() reads config.teams
    if (config.teams && (config.teams.roles.length > 0 || config.teams.teams.length > 0)) {
      this.teamCoordinator = new TeamCoordinator({
        runtime: this.agentRuntime,
        roles: config.teams.roles,
        teams: config.teams.teams,
      });
    }

    this.dashboardServer = new DashboardServer(
      () => this.buildSnapshot(),
      this.authManager,
      this.credentialStore,
      {
        configPath: this.configPath,
        onAgentReload: (list, defaults) => {
          // Hot-reload: merge partial defaults over the full current defaults
          const merged = { ...this.config.agents.defaults, ...defaults } as typeof this.config.agents.defaults;
          this.agentRuntime.reloadAgents(list, merged);
          this.config.agents.list     = list;
          this.config.agents.defaults = merged;
          console.log(`🔄 Agents hot-reloaded: ${list.length} agent(s)`);
        },
      },
    );

    // Periodic cache cleanup
    this.cachePurgeInterval = setInterval(() => {
      const removed = this.responseCache.purgeExpired();
      if (removed > 0) console.log(`🧹 Purged ${removed} expired cache entries`);
    }, 600_000); // every 10 minutes

    this.httpServer = createServer((req, res) => this.handleHttp(req, res));
  }

  /** Start the gateway server */
  async start(): Promise<void> {
    const { bind, port } = this.config.gateway;

    if (bind === '0.0.0.0') {
      console.warn('⚠️  WARNING: Binding to 0.0.0.0 exposes the gateway to the network!');
    }

    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: this.config.gateway.maxFrameSize,
      perMessageDeflate: false,
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    return new Promise((resolve) => {
      this.httpServer.listen(port, bind, async () => {
        // Initialise skill registry (discovers skills/*.skill.json)
        await this.skillRegistry.init();
        const enabledSkills = this.skillRegistry.list().filter(s => s.state.enabled);
        if (enabledSkills.length > 0) {
          // Inject skill-based tool allowlist into policy engine
          this.policyEngine.setSkillAllowlist(this.skillRegistry.toolAllowlist());
          // Wire composed system prompt into agent runtime
          this.agentRuntime.setSystemPromptProvider(() => this.skillRegistry.composedSystemPrompt());
          console.log(`🎯 Skills: ${enabledSkills.length} enabled (${enabledSkills.map(s => s.definition.name).join(', ')})`);
        } else if (this.skillRegistry.list().length > 0) {
          console.log(`🎯 Skills: ${this.skillRegistry.list().length} available (none enabled — use \`skill enable <name>\`)`);
        }

        // Start MCP servers (config + skill-contributed)
        const skillMcpServers = this.skillRegistry.mcpServersFromSkills();
        const hasMcpConfig = this.config.mcp && Object.keys(this.config.mcp.servers).length > 0;
        const hasSkillServers = Object.keys(skillMcpServers).length > 0;

        if (hasMcpConfig || hasSkillServers) {
          const mergedMcp = {
            servers: {
              ...(this.config.mcp?.servers ?? {}),
              ...skillMcpServers,
            },
            security: this.config.mcp?.security ?? {
              sandboxAll: true,
              denyCapabilities: [],
              perServerBudget: { dailyTokens: 50_000 },
            },
          };
          this.mcpRegistry = new McpRegistry(mergedMcp, this.budgetTracker);
          const mcpStatuses = await this.mcpRegistry.startAll();
          const adapter = new McpToolAdapter(this.toolRegistry, this.mcpRegistry);
          const mcpToolNames = adapter.registerAll();
          const readyCount = mcpStatuses.filter(s => s.ready).length;
          this.mcpServerStatuses = mcpStatuses.map(s => ({ name: s.name, ready: s.ready, tools: 0 }));
          // Enrich with registered tool counts
          for (const ms of this.mcpServerStatuses) {
            ms.tools = mcpToolNames.filter(n => n.startsWith(`mcp_${ms.name.replace(/[^a-z0-9]/gi, '_')}`)).length;
          }
          console.log(`🔌 MCP: ${readyCount}/${mcpStatuses.length} servers ready, ${mcpToolNames.length} tools registered`);
          for (const s of mcpStatuses) {
            if (!s.ready) console.warn(`   ⚠️  MCP server "${s.name}": ${s.error}`);
          }
        }

        // Start messaging adapters (config-based + credential-store fallback)
        {
          const hasCfgTelegram = this.config.messaging?.telegram?.enabled;
          const hasCfgDiscord  = this.config.messaging?.discord?.enabled;
          // Check credential store for a saved Telegram token (hot-connected from dashboard)
          const storedTgToken  = this.credentialStore?.getApiKey('telegram');

          if (hasCfgTelegram || hasCfgDiscord || storedTgToken) {
            this.messagingManager = new MessagingManager({
              config: this.config.messaging ?? {},
              runtime: this.agentRuntime,
              threat: this.threatDetector,
              defaultAgentId: this.defaultAgentId(),
            });
            const msgStatuses = await this.messagingManager.startAll();
            this.messagingStatuses = msgStatuses.map(s => ({ platform: s.platform, running: s.running }));
            for (const s of msgStatuses) {
              const icon = s.running ? '🟢' : '🔴';
              console.log(`${icon} Messaging: ${s.platform} ${s.running ? 'connected' : 'failed'}`);
            }
            // Auto-start from credential store if not covered by config
            if (storedTgToken && !hasCfgTelegram) {
              try {
                await this.messagingManager.startTelegram(storedTgToken);
                console.log('🤖 Telegram: auto-started from saved credentials');
              } catch (err) {
                console.warn(`⚠️  Telegram auto-start failed: ${(err as Error).message}`);
              }
            }
          } else {
            // Create a dormant manager so dashboard routes work even before first connect
            this.messagingManager = new MessagingManager({
              config: this.config.messaging ?? {},
              runtime: this.agentRuntime,
              threat: this.threatDetector,
              defaultAgentId: this.defaultAgentId(),
            });
          }
          // Wire messaging manager into dashboard so hot-connect routes work
          this.dashboardServer.setMessagingManager(this.messagingManager);
        }

        // Log dashboard URL
        if (this.config.teams) {
          const tc = this.teamCoordinator;
          if (tc) {
            console.log(`👥 Teams: ${tc.listTeams().length} team(s), ${tc.listRoles().length} role(s) loaded`);
          }
        }

        const providers = this.modelRouter.status();
        const availableProviders = providers.filter(p => p.available).map(p => p.name);

        console.log('');
        console.log('┌─────────────────────────────────────────────┐');
        console.log('│         AI_DESK Security Gateway            │');
        console.log('├─────────────────────────────────────────────┤');
        console.log(`│  Status:    🟢 Running                      │`);
        console.log(`│  Bind:      ${bind.padEnd(33)}│`);
        console.log(`│  Port:      ${String(port).padEnd(33)}│`);
        console.log(`│  Auth:      ${this.config.gateway.auth.mode.padEnd(33)}│`);
        console.log(`│  Sandbox:   ${this.config.agents.defaults.sandbox.mode.padEnd(33)}│`);
        console.log(`│  Tools:     ${this.config.agents.defaults.tools.profile.padEnd(33)}│`);
        console.log(`│  Providers: ${(availableProviders.join(',') || 'none').padEnd(33)}│`);
        console.log(`│  Cache:     ${(this.config.cache?.enabled ? 'on' : 'off').padEnd(33)}│`);
        console.log('├─────────────────────────────────────────────┤');
        console.log(`│  Dashboard: http://${bind}:${port}/dashboard`.padEnd(46) + '│');
        console.log('├─────────────────────────────────────────────┤');
        console.log('│  🔒 Auth mandatory | 🛡️ Sandbox always-on   │');
        console.log('└─────────────────────────────────────────────┘');
        console.log('');

        if (availableProviders.length === 0) {
          console.log('⚠️  No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.');
          console.log('    The gateway will reject chat messages until at least one is configured.\n');
        }

        const existingTokens = this.authManager.listTokens();
        if (existingTokens.length === 0) {
          const { token } = this.authManager.generateToken('initial');
          console.log('🔑 Initial auth token generated:');
          console.log(`   ${token}`);
          console.log('   Save this token — it will not be shown again.\n');
        }

        resolve();
      });
    });
  }

  /** Expose subsystems for CLI commands */
  get orchestratorInstance(): Orchestrator { return this.orchestrator; }
  get mcpRegistryInstance(): McpRegistry | null { return this.mcpRegistry; }
  get messagingManagerInstance(): MessagingManager | null { return this.messagingManager; }
  get skillRegistryInstance(): SkillRegistry { return this.skillRegistry; }
  get teamCoordinatorInstance(): TeamCoordinator | null { return this.teamCoordinator; }

  /** Handle new WebSocket connection */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const remoteAddress = req.socket.remoteAddress ?? 'unknown';
    const connectionId = uuid();

    if (!this.checkRateLimit(remoteAddress)) {
      ws.close(1008, 'Rate limit exceeded');
      eventBus.emit('security:alert', {
        type: 'rate_limit',
        remoteAddress,
      });
      return;
    }

    if (this.connections.size >= this.config.gateway.rateLimit.maxConnections) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    const meta: ConnectionMeta = {
      id: connectionId,
      remoteAddress,
      connectedAt: Date.now(),
    };

    this.connections.set(connectionId, { ws, meta });

    eventBus.emit('connection:open', {
      connectionId,
      remoteAddress,
      totalConnections: this.connections.size,
    });

    const challengeResult = this.authManager.createChallenge(remoteAddress);
    if ('error' in challengeResult) {
      ws.send(JSON.stringify(createMessage('error', { error: challengeResult.error })));
      ws.close(1008, 'Authentication required');
      return;
    }

    ws.send(JSON.stringify(createMessage('auth:challenge', {
      challengeId: challengeResult.challengeId,
      nonce: challengeResult.nonce,
    })));

    const authTimeout = setTimeout(() => {
      if (!meta.authenticatedAt) {
        ws.close(1008, 'Authentication timeout');
        this.connections.delete(connectionId);
      }
    }, 30_000);

    ws.on('message', (data: RawData) => {
      this.handleMessage(connectionId, data);
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(createMessage('ping', {})));
      }
    }, this.config.gateway.heartbeatIntervalMs);

    ws.on('close', () => {
      clearTimeout(authTimeout);
      clearInterval(heartbeat);
      this.connections.delete(connectionId);

      // Reject any pending approvals tied to this connection
      for (const [reqId, pending] of this.pendingApprovals) {
        if (pending.connectionId === connectionId) {
          clearTimeout(pending.timer);
          pending.resolve(false);
          this.pendingApprovals.delete(reqId);
        }
      }

      eventBus.emit('connection:close', {
        connectionId,
        remoteAddress,
        duration: Date.now() - meta.connectedAt,
      });
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error [${connectionId}]:`, err.message);
    });
  }

  /** Handle incoming WebSocket message */
  private handleMessage(connectionId: string, data: RawData): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const msg = parseMessage(data as Buffer);
    if (!msg) {
      conn.ws.send(JSON.stringify(createMessage('error', { error: 'Invalid message format' })));
      return;
    }

    if (msg.type === 'auth:response') {
      this.handleAuth(connectionId, msg);
      return;
    }

    if (msg.type === 'pong') return;

    if (!conn.meta.authenticatedAt) {
      conn.ws.send(JSON.stringify(createMessage('error', { error: 'Not authenticated' })));
      return;
    }

    switch (msg.type) {
      case 'chat:message':
        this.handleChatMessage(connectionId, msg);
        break;
      case 'system:status':
        this.handleStatusRequest(connectionId);
        break;
      case 'tool:approval:response':
        this.handleApprovalResponse(msg);
        break;
      case 'orchestrate:run':
        this.handleOrchestrateRun(connectionId, msg);
        break;
      default:
        conn.ws.send(JSON.stringify(createMessage('error', {
          error: `Unknown message type: ${msg.type}`,
        })));
    }
  }

  /** Handle authentication response */
  private handleAuth(connectionId: string, msg: ProtocolMessage): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const payload = msg.payload as { response?: string; token?: string };
    const token = payload.token ?? payload.response ?? '';

    const result = this.authManager.authenticateToken(token, conn.meta.remoteAddress);

    if (result.success) {
      conn.meta.authenticatedAt = Date.now();
      conn.ws.send(JSON.stringify(createMessage('auth:result', {
        success: true,
        tokenId: result.tokenId,
      })));
    } else {
      conn.ws.send(JSON.stringify(createMessage('auth:result', {
        success: false,
        error: result.error,
      })));

      setTimeout(() => conn.ws.close(1008, 'Authentication failed'), 100);
    }
  }

  /** Phase 2: real agent loop */
  private async handleChatMessage(connectionId: string, msg: ProtocolMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const payload = msg.payload as {
      content?: string;
      agentId?: string;
      channelId?: string;
      peerId?: string;
    };
    const content = payload.content ?? '';
    const agentId = payload.agentId ?? this.defaultAgentId();
    const channelId = payload.channelId ?? `conn:${connectionId}`;
    const peerId = payload.peerId ?? `conn:${connectionId}`;

    eventBus.emit('message:received', {
      connectionId,
      contentLength: content.length,
      agentId,
    });

    // Stream start
    const sessionId = `pending-${msg.id}`;
    conn.ws.send(JSON.stringify(createMessage('chat:stream:start', {
      sessionId,
      agentId,
    })));

    const onProgress = (event: AgentProgressEvent) => {
      conn.ws.send(JSON.stringify(createMessage('chat:stream:delta', {
        sessionId,
        done: false,
        event,
      })));
    };

    try {
      const result = await this.agentRuntime.run({
        userMessage: content,
        agentId,
        channelId,
        peerId,
        onProgress,
        // Bind approval flow to THIS connection so the right client sees the prompt
        // (handled via the executor.requestApproval — see requestApprovalFromActiveClient)
      });

      conn.ws.send(JSON.stringify(createMessage('chat:stream:end', {
        sessionId: result.sessionId,
        done: true,
      })));

      conn.ws.send(JSON.stringify(createMessage('chat:reply', {
        content: result.success
          ? result.content
          : `[Error] ${result.error}`,
        agentId: result.agentId,
        sessionId: result.sessionId,
        model: result.model,
        tokensUsed: result.tokensUsed,
      })));
    } catch (err) {
      conn.ws.send(JSON.stringify(createMessage('error', {
        error: `Agent run failed: ${(err as Error).message}`,
      })));
    }
  }

  /** Handle orchestrate:run — fan-out a task graph to multiple agents */
  private async handleOrchestrateRun(connectionId: string, msg: ProtocolMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const payload = msg.payload as {
      tasks?: unknown[];
      maxConcurrent?: number;
      failFast?: boolean;
    };

    if (!Array.isArray(payload.tasks) || payload.tasks.length === 0) {
      conn.ws.send(JSON.stringify(createMessage('error', { error: 'orchestrate:run requires a non-empty tasks array' })));
      return;
    }

    try {
      const result = await this.orchestrator.run({
        tasks: payload.tasks as never,
        maxConcurrent: payload.maxConcurrent,
        failFast: payload.failFast,
        channelId: `conn:${connectionId}`,
        peerId: `conn:${connectionId}`,
      });
      conn.ws.send(JSON.stringify(createMessage('orchestrate:result', result)));
    } catch (err) {
      conn.ws.send(JSON.stringify(createMessage('error', {
        error: `Orchestration failed: ${(err as Error).message}`,
      })));
    }
  }

  /** Handle a tool-approval response from the client */
  private handleApprovalResponse(msg: ProtocolMessage): void {
    const payload = msg.payload as { requestId?: string; approved?: boolean };
    if (!payload.requestId) return;

    const pending = this.pendingApprovals.get(payload.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(payload.requestId);
    pending.resolve(Boolean(payload.approved));
  }

  /**
   * Send tool-approval request to the most-recently-authenticated client and
   * wait for a response. Times out as denied after APPROVAL_TIMEOUT_MS.
   */
  private requestApprovalFromActiveClient(req: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    reason: string;
    sessionId: string;
  }): Promise<boolean> {
    // Pick the most recently authenticated client (typical desktop has one)
    const client = [...this.connections.values()]
      .filter(c => c.meta.authenticatedAt && c.ws.readyState === WebSocket.OPEN)
      .sort((a, b) => (b.meta.authenticatedAt ?? 0) - (a.meta.authenticatedAt ?? 0))[0];

    if (!client) {
      // No client to ask — auto-deny
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(req.requestId);
        resolve(false); // timeout = deny
      }, APPROVAL_TIMEOUT_MS);

      this.pendingApprovals.set(req.requestId, {
        resolve,
        timer,
        connectionId: client.meta.id,
      });

      client.ws.send(JSON.stringify(createMessage('tool:approval:request', {
        requestId: req.requestId,
        toolName: req.toolName,
        input: req.input,
        reason: req.reason,
        sessionId: req.sessionId,
      })));
    });
  }

  /** Handle system status request */
  private handleStatusRequest(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const activeSessions = this.sessionStore.listActive();
    const agentStatuses = this.config.agents.list.map(a => ({
      id: a.id,
      status: 'idle' as const,
      model: a.model?.primary ?? this.config.agents.defaults.model.primary,
      sessionsCount: activeSessions.filter(s => s.agentId === a.id).length,
    }));

    const defaultAgentId = this.defaultAgentId();
    const budget = this.budgetTracker.status(defaultAgentId);

    conn.ws.send(JSON.stringify(createMessage('system:status', {
      uptime: Date.now() - this.startTime,
      connections: this.connections.size,
      activeSessions: activeSessions.length,
      agents: agentStatuses,
      budget: {
        dailyUsed: budget.daily.tokens,
        dailyLimit: budget.daily.limit,
        monthlyUsed: budget.monthly.tokens,
        monthlyLimit: budget.monthly.limit,
      },
    })));
  }

  private defaultAgentId(): string {
    const def = this.config.agents.list.find(a => a.default) ?? this.config.agents.list[0];
    return def?.id ?? 'main';
  }

  /** Rate limiting per IP */
  private checkRateLimit(remoteAddress: string): boolean {
    const now = Date.now();
    const limit = this.rateLimitMap.get(remoteAddress);

    if (!limit || now > limit.resetAt) {
      this.rateLimitMap.set(remoteAddress, {
        count: 1,
        resetAt: now + 1000,
      });
      return true;
    }

    limit.count++;
    return limit.count <= this.config.gateway.rateLimit.maxPerSecond;
  }

  /** Handle HTTP requests (health check, dashboard, WebSocket upgrade hint) */
  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    // Dashboard routes (served before any other HTTP check)
    if (this.dashboardServer.handle(req, res)) return;

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Date.now() - this.startTime,
        connections: this.connections.size,
        providers: this.modelRouter.status().filter(p => p.available).map(p => p.name),
      }));
      return;
    }

    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('Upgrade Required — Use WebSocket');
  }

  /** Build a dashboard snapshot from live subsystem state */
  private buildSnapshot(): DashboardSnapshot {
    const activeSessions = this.sessionStore.listActive();
    const agents = this.config.agents.list.map(a => ({
      id: a.id,
      model: a.model?.primary ?? this.config.agents.defaults.model.primary,
      sessions: activeSessions.filter(s => s.agentId === a.id).length,
      status: this.agentRuntime.activeRunCount(a.id) > 0 ? 'running' : 'idle',
    }));

    const defaultId = this.defaultAgentId();
    const bStatus = this.budgetTracker.status(defaultId);
    const budget = {
      dailyUsed: bStatus.daily.tokens,
      dailyLimit: bStatus.daily.limit,
      monthlyUsed: bStatus.monthly.tokens,
      monthlyLimit: bStatus.monthly.limit,
      monthlyCostUsed: bStatus.monthly.cost ?? 0,
      monthlyCostLimit: this.config.agents.defaults.budget.monthly.cost ?? 0,
    };

    const skills = this.skillRegistry.list().map(s => ({
      name: s.definition.name,
      version: s.definition.version,
      enabled: s.state.enabled,
      description: s.definition.description,
    }));

    const teams = (this.config.teams?.teams ?? []).map(t => ({
      id: t.id,
      name: t.name,
      leadAgentId: t.leadAgentId,
      members: t.members,
    }));

    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      connections: this.connections.size,
      agents,
      teams,
      budget,
      skills,
      mcpServers: this.mcpServerStatuses,
      messaging: this.messagingStatuses,
      providers: this.modelRouter.status(),
    };
  }

  /** Run security audit */
  async runSecurityAudit() {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const engine = new AuditEngine(this.config, dataDir);
    return engine.runFullAudit();
  }

  /** Expose runtime for CLI harnesses (agent test etc.) */
  get runtime(): AgentRuntime { return this.agentRuntime; }
  get budget(): BudgetTracker { return this.budgetTracker; }
  get cache(): ResponseCache { return this.responseCache; }
  get router(): ModelRouter { return this.modelRouter; }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    console.log('\n🛑 Shutting down AI_DESK Gateway...');

    clearInterval(this.cachePurgeInterval);

    // Reject pending approvals
    for (const [, pending] of this.pendingApprovals) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingApprovals.clear();

    // Kill all sandboxed processes
    const killed = this.sandboxManager.killAll();
    if (killed > 0) console.log(`   Killed ${killed} sandboxed processes`);

    // Close all connections
    for (const [, { ws }] of this.connections) {
      ws.close(1001, 'Server shutting down');
    }
    this.connections.clear();

    // Stop dashboard SSE clients
    this.dashboardServer.destroy();

    // Stop messaging adapters
    if (this.messagingManager) {
      await this.messagingManager.stopAll();
      console.log('   Stopped messaging adapters');
    }

    // Stop MCP servers
    if (this.mcpRegistry) {
      await this.mcpRegistry.stopAll();
      console.log('   Stopped MCP servers');
    }

    // Close subsystems
    this.authManager.destroy();
    this.auditLog.close();
    this.sessionStore.close_db();
    this.budgetTracker.close();
    this.responseCache.close();

    // Close servers
    this.wss?.close();
    this.httpServer.close();

    console.log('   ✅ Gateway shutdown complete\n');
  }
}
