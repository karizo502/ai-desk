/**
 * AI_DESK — Telegram Adapter
 *
 * Long-polling implementation using the Telegram Bot API directly (no SDK).
 * Token read from TELEGRAM_BOT_TOKEN env var only.
 *
 * Flow:
 *   start() → getUpdates (offset, timeout=25s) → normalise → onMessage()
 *   onMessage resolves → sendMessage (reply) / sendChatAction (typing)
 *
 * Reconnection: polling loop restarts automatically on network errors with
 * exponential back-off (max 30s).
 */
import { MessagingAdapter, type IncomingMessage, type MessageHandler } from './adapter.js';
import type { TelegramConfig } from '../config/schema.js';
import { eventBus } from '../shared/events.js';

const API_BASE = 'https://api.telegram.org';
const POLL_TIMEOUT = 25; // seconds — Telegram long-poll window
const MAX_REPLY_LENGTH = 4096; // Telegram hard limit

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TgChat {
  id: number;
  type: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  date: number;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramAdapter extends MessagingAdapter {
  readonly platform = 'telegram' as const;
  private token: string;
  private config: TelegramConfig;
  private offset = 0;
  private running = false;
  private stopSignal = false;
  private botUsername = '';

  constructor(config: TelegramConfig, token?: string) {
    super();
    this.config = config;
    this.token = token ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  }

  get isRunning(): boolean { return this.running; }
  async getBotUsername(): Promise<string> { return this.botUsername; }

  async start(onMessage: MessageHandler): Promise<void> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    if (this.running) return;

    // Verify token by calling getMe
    const me = await this.api<TgUser>('getMe', {});
    this.botUsername = me.username ?? me.first_name ?? '';
    console.log(`🤖 Telegram bot connected: @${this.botUsername}`);
    eventBus.emit('messaging:telegram-ready', { bot: this.botUsername });

    this.running = true;
    this.stopSignal = false;
    this.pollLoop(onMessage).catch(err => {
      this.running = false;
      this.emit('error', err);
    });
  }

  async stop(): Promise<void> {
    this.stopSignal = true;
    this.running = false;
  }

  async sendReply(channelId: string, text: string, replyToMessageId?: string): Promise<void> {
    const chatId = Number(channelId);
    // Split messages longer than Telegram's 4096-char limit
    const chunks = splitText(text, MAX_REPLY_LENGTH);
    for (const chunk of chunks) {
      const params: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        ...(replyToMessageId && chunks.indexOf(chunk) === 0
          ? { reply_to_message_id: Number(replyToMessageId) }
          : {}),
      };
      try {
        await this.api('sendMessage', params);
      } catch (err) {
        // Telegram rejects unbalanced Markdown (*, _, `, etc.) — retry as plain text
        const msg = (err as Error).message ?? '';
        if (msg.includes('parse entities') || msg.includes('parse_mode') || msg.includes('Bad Request')) {
          delete params['parse_mode'];
          await this.api('sendMessage', params);
        } else {
          throw err;
        }
      }
    }
  }

  async sendTyping(channelId: string): Promise<void> {
    await this.api('sendChatAction', {
      chat_id: Number(channelId),
      action: 'typing',
    }).catch(() => { /* ignore — typing is best-effort */ });
  }

  // ─── Internal ────────────────────────────────────────────

  private async pollLoop(onMessage: MessageHandler): Promise<void> {
    let backoff = 1000;

    while (!this.stopSignal) {
      try {
        const updates = await this.api<TgUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT,
          allowed_updates: ['message'],
        });

        backoff = 1000; // reset on success

        for (const update of updates) {
          this.offset = update.update_id + 1;

          const msg = update.message;
          if (!msg?.text) continue;

          // Allowlist check
          if (this.config.allowedChatIds && this.config.allowedChatIds.length > 0) {
            if (!this.config.allowedChatIds.includes(msg.chat.id)) {
              eventBus.emit('messaging:telegram-denied', { chatId: msg.chat.id });
              continue;
            }
          }

          const incoming: IncomingMessage = {
            channelId: String(msg.chat.id),
            peerId: msg.from?.username ?? msg.from?.first_name ?? String(msg.from?.id ?? 'unknown'),
            text: msg.text,
            platform: 'telegram',
            messageId: String(msg.message_id),
          };

          // Fire-and-forget so one slow chat doesn't stall others
          onMessage(incoming).catch(err => {
            this.emit('error', err);
          });
        }
      } catch (err) {
        if (this.stopSignal) break;
        eventBus.emit('messaging:telegram-error', { error: (err as Error).message });
        // Exponential back-off, cap at 30s
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    }

    this.running = false;
  }

  private async api<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const url = `${API_BASE}/bot${this.token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(35_000),
    });

    const body = await response.json() as TgResponse<T>;
    if (!body.ok || body.result === undefined) {
      throw new Error(`Telegram API error (${method}): ${body.description ?? 'unknown'}`);
    }
    return body.result;
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

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
