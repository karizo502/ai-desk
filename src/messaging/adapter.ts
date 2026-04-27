/**
 * AI_DESK — Messaging Adapter Interface
 *
 * Base contract for all platform adapters (Telegram, Discord, …).
 * Each adapter translates platform events into IncomingMessage objects
 * and hands them to the MessagingManager for routing to AgentRuntime.
 */
import { EventEmitter } from 'node:events';

/** Normalised incoming message from any platform */
export interface IncomingMessage {
  /** Stable string id for the originating channel/chat */
  channelId: string;
  /** Who sent the message (username or display name) */
  peerId: string;
  /** The text content to forward to the agent */
  text: string;
  /** Platform-specific metadata */
  platform: 'telegram' | 'discord';
  /** Raw platform message id (for reply threading) */
  messageId: string;
  /** Optional: agent override from message payload (e.g. /ask@agent_id) */
  agentIdHint?: string;
}

/** Callback invoked by the adapter when a new message arrives */
export type MessageHandler = (msg: IncomingMessage) => Promise<void>;

export abstract class MessagingAdapter extends EventEmitter {
  abstract readonly platform: 'telegram' | 'discord';

  /** Start listening (polling or gateway connection) */
  abstract start(onMessage: MessageHandler): Promise<void>;

  /** Stop cleanly */
  abstract stop(): Promise<void>;

  /** Send a text reply to the originating channel */
  abstract sendReply(channelId: string, text: string, replyToMessageId?: string): Promise<void>;

  /** Optional: show a "typing…" indicator while the agent thinks */
  abstract sendTyping(channelId: string): Promise<void>;

  /** Whether the adapter is currently connected */
  abstract get isRunning(): boolean;
}
