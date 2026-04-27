/**
 * AI_DESK — Gateway Wire Protocol
 *
 * Message types and schemas for WebSocket communication.
 */

/** All message types in the protocol */
export type ProtocolMessageType =
  // Auth flow
  | 'auth:challenge'
  | 'auth:response'
  | 'auth:result'
  // Gateway control
  | 'ping'
  | 'pong'
  | 'error'
  // Chat
  | 'chat:message'
  | 'chat:reply'
  | 'chat:stream:start'
  | 'chat:stream:delta'
  | 'chat:stream:end'
  // Tool calls
  | 'tool:call'
  | 'tool:result'
  | 'tool:approval:request'
  | 'tool:approval:response'
  // Agent/session
  | 'session:info'
  | 'agent:status'
  // System
  | 'system:status'
  | 'system:audit'
  // Orchestration (Phase 3)
  | 'orchestrate:run'
  | 'orchestrate:result';

/** Base protocol message */
export interface ProtocolMessage {
  id: string;
  type: ProtocolMessageType;
  timestamp: number;
  payload: unknown;
}

// ─── Auth Messages ──────────────────────────────────────

export interface AuthChallengePayload {
  challengeId: string;
  nonce: string;
}

export interface AuthResponsePayload {
  challengeId: string;
  response: string;    // SHA-256(nonce + ":" + token) or raw token
}

export interface AuthResultPayload {
  success: boolean;
  tokenId?: string;
  error?: string;
}

// ─── Chat Messages ──────────────────────────────────────

export interface ChatMessagePayload {
  content: string;
  agentId?: string;      // Target agent (optional, uses default)
  channelId?: string;    // Channel identifier
  peerId?: string;       // Peer identifier
  attachments?: Array<{
    type: string;
    name: string;
    data: string;        // base64
  }>;
}

export interface ChatReplyPayload {
  content: string;
  agentId: string;
  sessionId: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
    cost: number;
  };
}

export interface StreamDeltaPayload {
  content: string;
  sessionId: string;
  done: boolean;
}

// ─── Tool Messages ──────────────────────────────────────

export interface ToolCallPayload {
  name: string;
  input: Record<string, unknown>;
  sessionId: string;
  runId: string;
}

export interface ToolApprovalRequestPayload {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  sessionId: string;
}

export interface ToolApprovalResponsePayload {
  requestId: string;
  approved: boolean;
}

// ─── System Messages ────────────────────────────────────

export interface SystemStatusPayload {
  uptime: number;
  connections: number;
  activeSessions: number;
  agents: Array<{
    id: string;
    status: 'active' | 'idle' | 'paused';
    model: string;
    sessionsCount: number;
  }>;
  budget: {
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
  };
}

/** Helper to create a protocol message */
export function createMessage(
  type: ProtocolMessageType,
  payload: unknown,
  id?: string
): ProtocolMessage {
  return {
    id: id ?? crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  };
}

/** Validate and parse a raw WebSocket message */
export function parseMessage(raw: string | Buffer): ProtocolMessage | null {
  try {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');

    // Size check (prevent large payload attacks)
    if (data.length > 1_048_576) {
      return null;
    }

    const msg = JSON.parse(data);

    if (!msg.id || !msg.type || !msg.timestamp) {
      return null;
    }

    return msg as ProtocolMessage;
  } catch {
    return null;
  }
}
