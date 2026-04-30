/**
 * AI_DESK — Shared Types
 *
 * Core types used across all modules.
 */

/** Unique identifiers */
export type AgentId = string;
export type SessionId = string;
export type ConnectionId = string;
export type PeerId = string;
export type RunId = string;

/** Lifecycle event types */
export type GatewayEvent =
  | 'connection:open'
  | 'connection:close'
  | 'connection:auth'
  | 'connection:auth:failed'
  | 'message:received'
  | 'message:sent'
  | 'session:created'
  | 'session:destroyed'
  | 'agent:start'
  | 'agent:end'
  | 'agent:error'
  | 'tool:request'
  | 'tool:result'
  | 'tool:denied'
  | 'subagent:spawn'
  | 'subagent:complete'
  | 'subagent:failed'
  | 'budget:warning'
  | 'budget:exceeded'
  | 'security:alert'
  | 'security:threat'
  | 'audit:entry'
  // MCP events
  | 'mcp:server-log'
  | 'mcp:server-exit'
  | 'mcp:server-ready'
  | 'mcp:server-error'
  // Orchestrator events
  | 'orchestrator:start'
  | 'orchestrator:complete'
  | 'orchestrator:task-start'
  | 'orchestrator:task-done'
  | 'orchestrator:task-failed'
  // Messaging events
  | 'messaging:telegram-ready'
  | 'messaging:telegram-error'
  | 'messaging:telegram-denied'
  | 'messaging:telegram-reconnect'
  | 'messaging:discord-ready'
  | 'messaging:discord-error'
  | 'messaging:discord-reconnect'
  | 'messaging:received'
  | 'messaging:replied'
  | 'messaging:error'
  // Skills events
  | 'skills:loaded'
  | 'skills:enabled'
  | 'skills:disabled'
  // Team events
  | 'team:start'
  | 'team:complete'
  | 'team:failed'
  // Workspace task events (emitted per individual task within a team run)
  | 'task:created'   // lead agent parsed tasks — one per task
  | 'task:started'   // task began executing
  | 'task:done'      // task finished successfully
  | 'task:failed'    // task finished with error
  | 'task:skipped'   // task skipped (dependency failed)
  | 'task:step'      // sub-step update (thinking / tool_use / tool_result)
  // Dashboard events
  | 'dashboard:client-connected'
  | 'dashboard:client-disconnected'
  // Memory events
  | 'memory:stored'
  | 'memory:retrieved'
  // Webhook events
  | 'webhook:triggered'
  // Cron events
  | 'cron:triggered'
  | 'cron:completed'
  | 'cron:failed'
  // Per-agent connection events
  | 'messaging:connection:started'
  | 'messaging:connection:stopped';

/** Connection metadata */
export interface ConnectionMeta {
  id: ConnectionId;
  remoteAddress: string;
  connectedAt: number;
  authenticatedAt?: number;
  agentId?: AgentId;
  sessionId?: SessionId;
  deviceId?: string;
}

/** Message envelope */
export interface MessageEnvelope {
  id: string;
  type: string;
  timestamp: number;
  payload: unknown;
  connectionId?: ConnectionId;
  sessionId?: SessionId;
  agentId?: AgentId;
}

/** Audit log entry */
export interface AuditEntry {
  id: string;
  timestamp: number;
  event: GatewayEvent;
  actor: string;           // connectionId, agentId, or 'system'
  target?: string;         // resource being acted upon
  detail?: string;         // human-readable detail
  metadata?: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

/** Tool execution request */
export interface ToolRequest {
  name: string;
  input: Record<string, unknown>;
  sessionId: SessionId;
  agentId: AgentId;
  runId: RunId;
  subagentDepth: number;
}

/** Tool execution result */
export interface ToolResult {
  name: string;
  output: unknown;
  durationMs: number;
  approved: boolean;
  sandboxed: boolean;
  tokensUsed?: number;
}

/** Budget status */
export interface BudgetStatus {
  agentId: AgentId;
  period: 'daily' | 'monthly';
  tokensUsed: number;
  tokensLimit: number;
  costUsed: number;
  costLimit: number;
  percentUsed: number;
  exceeded: boolean;
  paused: boolean;
}
