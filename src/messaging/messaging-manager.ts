/**
 * AI_DESK — Messaging Manager
 *
 * Manages lifecycle of all platform adapters and routes incoming messages
 * to AgentRuntime. Key behaviours:
 *
 *   • Per-channel concurrency lock: if the agent is already replying to channel X,
 *     a new message from X is queued (not dropped, not run in parallel).
 *     Queue depth is configurable (default 1 — drop if already 1 waiting).
 *
 *   • Typing indicator: sent as soon as the message is picked up, repeated
 *     every 5s while the agent works (platforms clear the indicator after ~5s).
 *
 *   • Threat detection: messages are scanned before routing; blocked messages
 *     get a short "I can't help with that" reply.
 *
 *   • Budget & errors: on budget exceeded or agent error, the user gets a
 *     descriptive reply instead of silence.
 */
import { TelegramAdapter } from './telegram-adapter.js';
import { DiscordAdapter } from './discord-adapter.js';
import type { MessagingAdapter, IncomingMessage } from './adapter.js';
import type { AgentRuntime } from '../agents/agent-runtime.js';
import type { ApprovalRequester } from '../agents/tool-executor.js';
import type { ThreatDetector } from '../security/threat-detector.js';
import type { MessagingConfig } from '../config/schema.js';
import type { TeamCoordinator } from '../roles/team-coordinator.js';
import type { ProjectStore } from '../projects/project-store.js';
import type { IssueStore } from '../projects/issue-store.js';
import { buildRunTeamTool } from '../roles/run-team-tool.js';
import { eventBus } from '../shared/events.js';

export interface MessagingManagerStatus {
  platform: 'telegram' | 'discord';
  running: boolean;
}

const TYPING_REPEAT_MS = 4_500; // slightly under platform's ~5s window

export class MessagingManager {
  private adapters: MessagingAdapter[] = [];
  private runtime: AgentRuntime;
  private threat: ThreatDetector;
  private config: MessagingConfig;
  private defaultAgentId: string;

  /** channelId → true means an agent call is running */
  private channelLocks = new Map<string, boolean>();
  /** channelId → next queued message (max 1) */
  private channelQueue = new Map<string, IncomingMessage>();

  /** Named per-agent connections: connectionId → adapter instance */
  private namedAdapters = new Map<string, MessagingAdapter>();
  /** Adapter instance → agentId override (for per-agent routing) */
  private adapterAgents = new Map<MessagingAdapter, string>();
  private teamCoordinator: TeamCoordinator | null = null;
  private projectStore: ProjectStore | null = null;
  private issueStore: IssueStore | null = null;

  constructor(opts: {
    config: MessagingConfig;
    runtime: AgentRuntime;
    threat: ThreatDetector;
    defaultAgentId: string;
    teamCoordinator?: TeamCoordinator;
    projectStore?: ProjectStore;
    issueStore?: IssueStore;
  }) {
    this.config = opts.config;
    this.runtime = opts.runtime;
    this.threat = opts.threat;
    this.defaultAgentId = opts.defaultAgentId;
    this.teamCoordinator = opts.teamCoordinator ?? null;
    this.projectStore = opts.projectStore ?? null;
    this.issueStore = opts.issueStore ?? null;
  }

  async startAll(): Promise<MessagingManagerStatus[]> {
    const statuses: MessagingManagerStatus[] = [];

    if (this.config.telegram?.enabled) {
      const adapter = new TelegramAdapter(this.config.telegram);
      adapter.on('error', err => eventBus.emit('messaging:error', { platform: 'telegram', error: (err as Error).message }));
      try {
        await adapter.start(msg => this.route(adapter, msg));
        this.adapters.push(adapter);
        statuses.push({ platform: 'telegram', running: true });
      } catch (err) {
        statuses.push({ platform: 'telegram', running: false });
        console.error(`❌ Telegram adapter failed: ${(err as Error).message}`);
      }
    }

    if (this.config.discord?.enabled) {
      const adapter = new DiscordAdapter(this.config.discord);
      adapter.on('error', err => eventBus.emit('messaging:error', { platform: 'discord', error: (err as Error).message }));
      try {
        await adapter.start(msg => this.route(adapter, msg));
        this.adapters.push(adapter);
        statuses.push({ platform: 'discord', running: true });
      } catch (err) {
        statuses.push({ platform: 'discord', running: false });
        console.error(`❌ Discord adapter failed: ${(err as Error).message}`);
      }
    }

    return statuses;
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.stop()));
    // Stop named adapters too
    await Promise.allSettled([...this.namedAdapters.values()].map(a => a.stop()));
    this.adapters = [];
    this.namedAdapters.clear();
    this.adapterAgents.clear();
    this.channelLocks.clear();
    this.channelQueue.clear();
  }

  status(): MessagingManagerStatus[] {
    return this.adapters.map(a => ({ platform: a.platform, running: a.isRunning }));
  }

  // ─── Hot-connect ──────────────────────────────────────────

  /** Connect (or reconnect) Telegram with a live token — no restart needed. */
  async startTelegram(token: string): Promise<{ botUsername: string }> {
    // Stop any existing Telegram adapter first
    const existing = this.adapters.find(a => a.platform === 'telegram');
    if (existing) {
      await existing.stop();
      this.adapters = this.adapters.filter(a => a.platform !== 'telegram');
    }

    const cfg = { enabled: true, maxConcurrentPerChat: 1, ...this.config.telegram };
    const adapter = new TelegramAdapter(cfg, token);
    adapter.on('error', err =>
      eventBus.emit('messaging:error', { platform: 'telegram', error: (err as Error).message }),
    );

    // start() calls getMe internally and throws if the token is invalid
    await adapter.start(msg => this.route(adapter, msg));
    this.adapters.push(adapter);

    // Retrieve bot username for confirmation
    const botUsername: string = await (adapter as unknown as { getBotUsername(): Promise<string> })
      .getBotUsername().catch(() => '');
    return { botUsername };
  }

  /** Disconnect Telegram adapter without affecting other platforms. */
  async stopTelegram(): Promise<void> {
    const adapter = this.adapters.find(a => a.platform === 'telegram');
    if (adapter) {
      await adapter.stop();
      this.adapters = this.adapters.filter(a => a.platform !== 'telegram');
    }
  }

  isTelegramRunning(): boolean {
    return this.adapters.some(a => a.platform === 'telegram' && a.isRunning);
  }

  // ─── Named per-agent connections ──────────────────────────

  /** Start a named per-agent connection (Telegram or Discord). */
  async startNamedConnection(
    id: string,
    platform: 'telegram' | 'discord',
    token: string,
    agentId: string,
  ): Promise<{ botUsername?: string }> {
    // Stop existing connection with same id if any
    await this.stopNamedConnection(id);

    let adapter: MessagingAdapter;
    if (platform === 'telegram') {
      const cfg = { enabled: true, maxConcurrentPerChat: 1, ...(this.config.telegram ?? {}) };
      adapter = new TelegramAdapter(cfg, token);
    } else {
      const cfg = { enabled: true, maxConcurrentPerChannel: 1, ...(this.config.discord ?? {}) };
      adapter = new DiscordAdapter(cfg, token);
    }

    adapter.on('error', err =>
      eventBus.emit('messaging:error', { platform, error: (err as Error).message }),
    );

    await adapter.start(msg => this.route(adapter, msg));

    this.namedAdapters.set(id, adapter);
    this.adapterAgents.set(adapter, agentId);

    eventBus.emit('messaging:connection:started', { id, platform, agentId });

    let botUsername: string | undefined;
    if (platform === 'telegram') {
      botUsername = await (adapter as unknown as { getBotUsername(): Promise<string> })
        .getBotUsername().catch(() => '');
    }

    return { botUsername };
  }

  /** Stop a named per-agent connection. Safe to call if not running. */
  async stopNamedConnection(id: string): Promise<void> {
    const adapter = this.namedAdapters.get(id);
    if (!adapter) return;
    await adapter.stop().catch(() => {});
    this.adapterAgents.delete(adapter);
    this.namedAdapters.delete(id);
    eventBus.emit('messaging:connection:stopped', { id });
  }

  /** Returns a map of connectionId → running status for all named adapters. */
  listNamedConnections(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [id, adapter] of this.namedAdapters) {
      result[id] = adapter.isRunning;
    }
    return result;
  }

  // ─── Routing ─────────────────────────────────────────────

  private async route(adapter: MessagingAdapter, msg: IncomingMessage): Promise<void> {
    eventBus.emit('messaging:received', {
      platform: msg.platform,
      channelId: msg.channelId,
      peerId: msg.peerId,
    });

    // Threat scan
    const scan = this.threat.scan(msg.text);
    if (!scan.safe) {
      eventBus.emit('security:threat', { source: 'messaging', platform: msg.platform, score: scan.score });
      await adapter.sendReply(msg.channelId, "Sorry, I can't help with that.", msg.messageId);
      return;
    }

    // Per-channel concurrency lock
    if (this.channelLocks.get(msg.channelId)) {
      // Queue latest message (overwriting any previous queued one)
      this.channelQueue.set(msg.channelId, msg);
      return;
    }

    await this.runWithLock(adapter, msg);
  }

  private async runWithLock(adapter: MessagingAdapter, msg: IncomingMessage): Promise<void> {
    this.channelLocks.set(msg.channelId, true);

    try {
      await this.dispatch(adapter, msg);
    } finally {
      this.channelLocks.delete(msg.channelId);

      // Process any queued message for this channel
      const queued = this.channelQueue.get(msg.channelId);
      if (queued) {
        this.channelQueue.delete(msg.channelId);
        // Kick off next without blocking the finally chain
        setImmediate(() => this.runWithLock(adapter, queued));
      }
    }
  }

  private async dispatch(adapter: MessagingAdapter, msg: IncomingMessage): Promise<void> {
    // Routing modes (same as WebSocket gateway):
    //   @direct <msg>       — lead handles alone, no run_team tool
    //   @team <msg>         — force lead's primary team
    //   @team/{id} <msg>    — force specific team by id
    //   <msg>               — lead handles directly; run_team tool available
    let text = msg.text;
    let forceTeamId: string | null = null;
    let soloMode = false;

    if (msg.text.startsWith('@direct ')) {
      text = msg.text.slice('@direct '.length);
      soloMode = true;
    } else if (msg.text.startsWith('@team/')) {
      const rest = msg.text.slice('@team/'.length);
      const spaceIdx = rest.indexOf(' ');
      forceTeamId = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
      text = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1);
    } else if (msg.text.startsWith('@team ')) {
      text = msg.text.slice('@team '.length);
      forceTeamId = '__lead__';
    }

    // Per-adapter agent override takes priority over platform-level config
    const agentId = msg.agentIdHint
      ?? this.adapterAgents.get(adapter)
      ?? this.agentIdFor(msg.platform)
      ?? this.defaultAgentId;

    // Resolve __lead__ sentinel to actual team id
    if (forceTeamId === '__lead__' && this.teamCoordinator) {
      const leadTeam = this.teamCoordinator.findTeamByLead(agentId);
      forceTeamId = leadTeam?.id ?? null;
    }

    // ── @project commands — handled before typing / lock ──────────────────────
    if (msg.text.startsWith('@project ') || msg.text === '@project') {
      const projectReply = await this.handleProjectCommand(msg.text, agentId, forceTeamId);
      await adapter.sendReply(msg.channelId, projectReply, msg.messageId);
      return;
    }

    // For forced team runs
    const team = (forceTeamId && this.teamCoordinator)
      ? this.teamCoordinator.listTeams().find(t => t.id === forceTeamId) ?? null
      : null;

    // Build a Telegram inline-keyboard approval requester when all conditions are met:
    //   1. Message came from Telegram
    //   2. The agent has telegramApproval: true
    //   3. The Telegram config has approvalChatId set
    const requestApproval: ApprovalRequester | undefined = (() => {
      if (msg.platform !== 'telegram') return undefined;
      if (!(adapter instanceof TelegramAdapter)) return undefined;
      if (!this.config.telegram?.approvalChatId) return undefined;

      const agentCfg = this.runtime.getAgent(agentId);
      if (!agentCfg?.telegramApproval) return undefined;

      return (req) => (adapter as TelegramAdapter).requestApprovalViaTelegram({
        requestId: req.requestId,
        toolName: req.toolName,
        input: req.input,
        reason: req.reason,
        timeoutMs: 5 * 60_000, // 5-minute window to respond
      });
    })();

    // Send typing indicator, refresh every TYPING_REPEAT_MS
    await adapter.sendTyping(msg.channelId);
    const typingTimer = setInterval(
      () => adapter.sendTyping(msg.channelId).catch(() => {}),
      TYPING_REPEAT_MS,
    );

    try {
      let reply: string;

      if (team) {
        // @team / @team/{id} — force team delegation
        const teamResult = await this.teamCoordinator!.run(team.id, text, {
          channelId: msg.channelId,
          peerId: msg.peerId,
        });
        reply = teamResult.synthesis || '(no response)';
        clearInterval(typingTimer);
        await adapter.sendReply(msg.channelId, reply, msg.messageId);
        eventBus.emit('messaging:replied', {
          platform: msg.platform,
          channelId: msg.channelId,
          model: 'team',
          tokens: teamResult.tokensUsed.total,
          durationMs: teamResult.totalDurationMs,
        });
      } else {
        // Normal / @direct — lead handles directly.
        // In normal mode, inject run_team so lead can self-delegate.
        const leadTeam = (!soloMode && this.teamCoordinator)
          ? this.teamCoordinator.findTeamByLead(agentId)
          : null;
        const extraTools = leadTeam
          ? [buildRunTeamTool({
              teamCoordinator: this.teamCoordinator!,
              defaultTeamId: leadTeam.id,
              channelId: msg.channelId,
              peerId: msg.peerId,
            })]
          : undefined;

        const result = await this.runtime.run({
          userMessage: text,
          agentId,
          channelId: msg.channelId,
          peerId: msg.peerId,
          requestApproval,
          extraTools,
          onProgress: (event) => {
            // Refresh typing on each agent step so it doesn't expire
            if (event.type === 'thinking' || event.type === 'tool_use') {
              adapter.sendTyping(msg.channelId).catch(() => {});
            }
          },
        });

        clearInterval(typingTimer);

        reply = result.success
          ? result.content || '(no response)'
          : `⚠️ ${result.error ?? 'Something went wrong.'}`;

        await adapter.sendReply(msg.channelId, reply, msg.messageId);

        eventBus.emit('messaging:replied', {
          platform: msg.platform,
          channelId: msg.channelId,
          model: result.model,
          tokens: result.tokensUsed.total,
          durationMs: result.durationMs,
        });
      }
    } catch (err) {
      clearInterval(typingTimer);
      const errMsg = (err as Error).message;
      eventBus.emit('messaging:error', { platform: msg.platform, error: errMsg });
      await adapter.sendReply(msg.channelId, `⚠️ Internal error: ${errMsg}`, msg.messageId)
        .catch(() => {});
    }
  }

  // ─── @project command handler ─────────────────────────────────────────────

  private async handleProjectCommand(
    rawText: string,
    agentId: string,
    forceTeamId: string | null,
  ): Promise<string> {
    if (!this.projectStore || !this.teamCoordinator) {
      return '⚠️ Project tracking is not enabled (no teams configured).';
    }

    // Derive teamId — prefer explicit override, then lead's team
    const teamId = forceTeamId
      ?? this.teamCoordinator.findTeamByLead(agentId)?.id
      ?? null;

    const parts = rawText.trim().split(/\s+/);
    const sub = parts[1] ?? '';

    if (!sub || sub === 'list') {
      // @project list — show active projects for this team
      if (!teamId) return '⚠️ Could not determine team — use @team/id first.';
      const projects = this.projectStore.listAll(20).filter(p => p.teamId === teamId);
      if (projects.length === 0) return 'No projects found for this team. Start a @team run to create one.';
      const lines = projects.map(p => {
        const icon = p.status === 'archived' ? '📦' : '📁';
        return `${icon} \`${p.id}\` **${p.name}** — ${p.workspacePath}`;
      });
      return `**Projects (${projects.length})**\n${lines.join('\n')}\n\nUse \`@project switch <id>\` to set the active project.`;
    }

    if (sub === 'switch') {
      const id = parts[2] ?? '';
      if (!id) return 'Usage: `@project switch <project-id>`';
      const project = this.projectStore.getProject(id);
      if (!project) return `⚠️ Project \`${id}\` not found.`;
      this.projectStore.touchProject(id);
      return `✅ Switched to project **${project.name}** (\`${id}\`). Future @team runs for this team will continue under this project.`;
    }

    if (sub === 'archive') {
      if (!teamId) return '⚠️ Could not determine team.';
      const active = this.projectStore.findActiveByTeam(teamId);
      if (!active) return '⚠️ No active project to archive.';
      this.projectStore.archive(active.id);
      return `📦 Archived project **${active.name}** (\`${active.id}\`). Next @team run will start a new project.`;
    }

    if (sub === 'issues') {
      if (!this.issueStore) return '⚠️ Issue tracking not available.';
      if (!teamId) return '⚠️ Could not determine team.';
      const active = this.projectStore.findActiveByTeam(teamId);
      if (!active) return '⚠️ No active project.';
      const issues = this.issueStore.listOpen(active.id);
      if (issues.length === 0) return `No open issues for **${active.name}**.`;
      const lines = issues.map(iss => {
        const icon = iss.kind === 'bug' ? '🐛' : iss.kind === 'feature_request' ? '✨' : '❓';
        return `${icon} \`${iss.id}\` **${iss.title}**${iss.body ? `\n   ${iss.body.slice(0, 120)}` : ''}`;
      });
      return `**Open Issues — ${active.name}** (${issues.length})\n${lines.join('\n')}`;
    }

    if (sub === 'show') {
      const id = parts[2] ?? (teamId ? this.projectStore.findActiveByTeam(teamId)?.id ?? '' : '');
      if (!id) return 'Usage: `@project show <project-id>` or have an active project.';
      const project = this.projectStore.getProject(id);
      if (!project) return `⚠️ Project \`${id}\` not found.`;
      const artifacts = this.projectStore.listArtifacts(id);
      const runs = this.projectStore.listRunsByProject(id, 5);
      const runLines = runs.map(r => {
        const icon = r.status === 'done' ? '✓' : r.status === 'failed' ? '✗' : '…';
        return `[${icon}] ${r.kind}: ${r.goal.slice(0, 60)}`;
      });
      return [
        `**${project.name}** (\`${project.id}\`)`,
        `Path: ${project.workspacePath}`,
        project.brief ? `\n${project.brief.slice(0, 300)}` : '',
        artifacts.length > 0 ? `\n**Artifacts (${artifacts.length}):** ${artifacts.slice(0, 5).map(a => a.path).join(', ')}` : '',
        runs.length > 0 ? `\n**Recent Runs:**\n${runLines.join('\n')}` : '',
      ].filter(Boolean).join('\n');
    }

    return [
      '**@project commands:**',
      '  `@project list` — list all projects for this team',
      '  `@project show [id]` — show active project details',
      '  `@project switch <id>` — set active project',
      '  `@project archive` — archive current project',
      '  `@project issues` — list open issues',
    ].join('\n');
  }

  private agentIdFor(platform: 'telegram' | 'discord'): string | undefined {
    if (platform === 'telegram') return this.config.telegram?.agentId;
    if (platform === 'discord') return this.config.discord?.agentId;
    return undefined;
  }
}
