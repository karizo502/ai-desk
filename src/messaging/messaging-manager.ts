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
import type { ThreatDetector } from '../security/threat-detector.js';
import type { MessagingConfig } from '../config/schema.js';
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

  constructor(opts: {
    config: MessagingConfig;
    runtime: AgentRuntime;
    threat: ThreatDetector;
    defaultAgentId: string;
  }) {
    this.config = opts.config;
    this.runtime = opts.runtime;
    this.threat = opts.threat;
    this.defaultAgentId = opts.defaultAgentId;
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
    this.adapters = [];
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
    const agentId = msg.agentIdHint ?? this.agentIdFor(msg.platform) ?? this.defaultAgentId;

    // Send typing indicator, refresh every TYPING_REPEAT_MS
    await adapter.sendTyping(msg.channelId);
    const typingTimer = setInterval(
      () => adapter.sendTyping(msg.channelId).catch(() => {}),
      TYPING_REPEAT_MS,
    );

    try {
      const result = await this.runtime.run({
        userMessage: msg.text,
        agentId,
        channelId: msg.channelId,
        peerId: msg.peerId,
        onProgress: (event) => {
          // Refresh typing on each agent step so it doesn't expire
          if (event.type === 'thinking' || event.type === 'tool_use') {
            adapter.sendTyping(msg.channelId).catch(() => {});
          }
        },
      });

      clearInterval(typingTimer);

      const reply = result.success
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
    } catch (err) {
      clearInterval(typingTimer);
      const errMsg = (err as Error).message;
      eventBus.emit('messaging:error', { platform: msg.platform, error: errMsg });
      await adapter.sendReply(msg.channelId, `⚠️ Internal error: ${errMsg}`, msg.messageId)
        .catch(() => {});
    }
  }

  private agentIdFor(platform: 'telegram' | 'discord'): string | undefined {
    if (platform === 'telegram') return this.config.telegram?.agentId;
    if (platform === 'discord') return this.config.discord?.agentId;
    return undefined;
  }
}
