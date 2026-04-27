/**
 * AI_DESK — Discord Adapter
 *
 * Connects to the Discord Gateway (WebSocket) using the bot token from
 * DISCORD_BOT_TOKEN env var. No external SDK — pure WebSocket + fetch.
 *
 * Supported triggers:
 *   • Direct message to the bot (any channel)
 *   • Message starting with configured prefix (default "!")
 *   • @mention of the bot
 *
 * Reconnection: resumes with session_id + seq on disconnect;
 * full re-identify on invalid session. Exponential back-off (max 30s).
 */
import { WebSocket } from 'ws';
import { MessagingAdapter, type IncomingMessage, type MessageHandler } from './adapter.js';
import type { DiscordConfig } from '../config/schema.js';
import { eventBus } from '../shared/events.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const REST_BASE = 'https://discord.com/api/v10';
const MAX_REPLY_LENGTH = 2000;

// Discord Gateway opcodes
const OP = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  Resume: 6,
  Reconnect: 7,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatACK: 11,
} as const;

// Intents: GUILDS (1) | GUILD_MESSAGES (512) | MESSAGE_CONTENT (32768) | DIRECT_MESSAGES (4096)
const INTENTS = 1 | 512 | 32768 | 4096;

interface DiscordUser {
  id: string;
  username: string;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  content: string;
  mentions: DiscordUser[];
}

interface GatewayPayload {
  op: number;
  d: unknown;
  s?: number;
  t?: string;
}

export class DiscordAdapter extends MessagingAdapter {
  readonly platform = 'discord' as const;
  private token: string;
  private config: DiscordConfig;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private botUserId = '';
  private running = false;
  private stopSignal = false;
  private onMessageCb: MessageHandler | null = null;

  constructor(config: DiscordConfig, token?: string) {
    super();
    this.config = config;
    this.token = token ?? process.env.DISCORD_BOT_TOKEN ?? '';
  }

  get isRunning(): boolean { return this.running; }

  async start(onMessage: MessageHandler): Promise<void> {
    if (!this.token) throw new Error('DISCORD_BOT_TOKEN is not set');
    if (this.running) return;

    // Fetch bot identity
    const me = await this.rest<DiscordUser>('GET', '/users/@me');
    this.botUserId = me.id;
    console.log(`🎮 Discord bot connected: ${me.username}#${me.id}`);
    eventBus.emit('messaging:discord-ready', { bot: me.username });

    this.onMessageCb = onMessage;
    this.running = true;
    this.stopSignal = false;
    this.connect(GATEWAY_URL);
  }

  async stop(): Promise<void> {
    this.stopSignal = true;
    this.running = false;
    this.clearHeartbeat();
    this.ws?.close(1000, 'shutdown');
    this.ws = null;
  }

  async sendReply(channelId: string, text: string): Promise<void> {
    const chunks = splitText(text, MAX_REPLY_LENGTH);
    for (const chunk of chunks) {
      await this.rest('POST', `/channels/${channelId}/messages`, { content: chunk });
    }
  }

  async sendTyping(channelId: string): Promise<void> {
    await this.rest('POST', `/channels/${channelId}/typing`, {}).catch(() => { /* best-effort */ });
  }

  // ─── Gateway Connection ───────────────────────────────────

  private connect(gatewayUrl: string, backoff = 1000): void {
    if (this.stopSignal) return;

    this.ws = new WebSocket(gatewayUrl);

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as GatewayPayload;
        this.handlePayload(payload);
      } catch { /* ignore malformed */ }
    });

    this.ws.on('close', (code) => {
      this.clearHeartbeat();
      if (this.stopSignal) return;

      // 4004 = bad token, 4014 = missing intent — don't retry
      if (code === 4004 || code === 4014) {
        this.running = false;
        this.emit('error', new Error(`Discord gateway closed with code ${code} — check token/intents`));
        return;
      }

      eventBus.emit('messaging:discord-reconnect', { code, backoff });
      // Use resume URL if available
      const url = this.resumeGatewayUrl ?? GATEWAY_URL;
      setTimeout(() => this.connect(url, Math.min(backoff * 2, 30_000)), backoff);
    });

    this.ws.on('error', (err) => {
      eventBus.emit('messaging:discord-error', { error: err.message });
    });
  }

  private handlePayload(payload: GatewayPayload): void {
    if (payload.s != null) this.seq = payload.s;

    switch (payload.op) {
      case OP.Hello: {
        const { heartbeat_interval } = payload.d as { heartbeat_interval: number };
        this.startHeartbeat(heartbeat_interval);
        // Resume if we have a session, otherwise identify fresh
        if (this.sessionId && this.seq != null) {
          this.send({ op: OP.Resume, d: { token: this.token, session_id: this.sessionId, seq: this.seq } });
        } else {
          this.identify();
        }
        break;
      }

      case OP.Dispatch: {
        if (payload.t === 'READY') {
          const d = payload.d as { session_id: string; resume_gateway_url: string; user: DiscordUser };
          this.sessionId = d.session_id;
          this.resumeGatewayUrl = d.resume_gateway_url + '?v=10&encoding=json';
        } else if (payload.t === 'MESSAGE_CREATE') {
          this.handleMessageCreate(payload.d as DiscordMessage);
        }
        break;
      }

      case OP.Heartbeat:
        this.sendHeartbeat();
        break;

      case OP.Reconnect:
        this.ws?.close();
        break;

      case OP.InvalidSession: {
        // If resumable, wait and retry; otherwise re-identify fresh
        const resumable = payload.d as boolean;
        if (!resumable) {
          this.sessionId = null;
          this.seq = null;
          this.resumeGatewayUrl = null;
        }
        setTimeout(() => this.ws?.close(), 1000 + Math.random() * 4000);
        break;
      }
    }
  }

  private handleMessageCreate(msg: DiscordMessage): void {
    // Ignore bots (including self)
    if (msg.author.bot) return;

    // Guild allowlist
    if (this.config.allowedGuildIds && this.config.allowedGuildIds.length > 0) {
      if (!msg.guild_id || !this.config.allowedGuildIds.includes(msg.guild_id)) return;
    }

    // Channel allowlist
    if (this.config.allowedChannelIds && this.config.allowedChannelIds.length > 0) {
      if (!this.config.allowedChannelIds.includes(msg.channel_id)) return;
    }

    const prefix = this.config.prefix ?? '';
    const isMentioned = msg.mentions.some(u => u.id === this.botUserId);
    const isDM = !msg.guild_id;
    const hasPrefix = prefix && msg.content.startsWith(prefix);

    if (!isMentioned && !isDM && !hasPrefix) return;

    // Strip the prefix / mention from the text
    let text = msg.content;
    if (hasPrefix) text = text.slice(prefix.length).trim();
    if (isMentioned) text = text.replace(/<@!?\d+>/g, '').trim();
    if (!text) return;

    const incoming: IncomingMessage = {
      channelId: msg.channel_id,
      peerId: msg.author.username,
      text,
      platform: 'discord',
      messageId: msg.id,
    };

    this.onMessageCb?.(incoming).catch(err => this.emit('error', err));
  }

  private identify(): void {
    this.send({
      op: OP.Identify,
      d: {
        token: this.token,
        intents: INTENTS,
        properties: { os: 'linux', browser: 'ai-desk', device: 'ai-desk' },
      },
    });
  }

  private startHeartbeat(intervalMs: number): void {
    this.clearHeartbeat();
    // Jitter first heartbeat to avoid thundering herd
    setTimeout(() => {
      this.sendHeartbeat();
      this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs);
    }, Math.random() * intervalMs);
  }

  private sendHeartbeat(): void {
    this.send({ op: OP.Heartbeat, d: this.seq });
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ─── REST helper ─────────────────────────────────────────

  private async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${REST_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AI-DESK (ai-desk, 3.0)',
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 204) return undefined as T;

    const data = await response.json() as T;
    if (!response.ok) {
      throw new Error(`Discord REST error ${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    }
    return data;
  }
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}
