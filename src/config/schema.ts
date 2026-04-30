/**
 * AI_DESK — Config Schema (TypeBox)
 *
 * All configuration types with strict validation.
 * Security defaults are baked in — insecure values are impossible.
 */
import { Type, type Static } from '@sinclair/typebox';

// ─── Auth ─────────────────────────────────────────────────
export const AuthModeSchema = Type.Union([
  Type.Literal('token'),
  Type.Literal('password'),
  Type.Literal('certificate'),
]);
export type AuthMode = Static<typeof AuthModeSchema>;

export const AuthConfigSchema = Type.Object({
  mode: AuthModeSchema,
  maxFailedAttempts: Type.Number({ default: 5, minimum: 1 }),
  lockoutDurationMs: Type.Number({ default: 300_000, minimum: 60_000 }), // 5 min
  tokenExpiryMs: Type.Number({ default: 86_400_000 }), // 24 hours
});
export type AuthConfig = Static<typeof AuthConfigSchema>;

// ─── Gateway ──────────────────────────────────────────────
export const GatewayConfigSchema = Type.Object({
  bind: Type.String({ default: '127.0.0.1' }),
  port: Type.Number({ default: 18789, minimum: 1024, maximum: 65535 }),
  auth: AuthConfigSchema,
  rateLimit: Type.Object({
    maxPerSecond: Type.Number({ default: 10, minimum: 1 }),
    maxConnections: Type.Number({ default: 50, minimum: 1 }),
  }),
  maxFrameSize: Type.Number({ default: 1_048_576 }), // 1MB
  heartbeatIntervalMs: Type.Number({ default: 30_000 }),
});
export type GatewayConfig = Static<typeof GatewayConfigSchema>;

// ─── Sandbox ──────────────────────────────────────────────
export const SandboxModeSchema = Type.Union([
  Type.Literal('all'),
  Type.Literal('untrusted'),
]);
// NOTE: 'off' is intentionally omitted — sandbox is mandatory in AI_DESK
export type SandboxMode = Static<typeof SandboxModeSchema>;

export const SandboxConfigSchema = Type.Object({
  mode: SandboxModeSchema,
  timeoutMs: Type.Number({ default: 30_000 }),
  maxMemoryMb: Type.Number({ default: 512 }),
  networkAccess: Type.Boolean({ default: false }),
});
export type SandboxConfig = Static<typeof SandboxConfigSchema>;

// ─── Tool Policy ──────────────────────────────────────────
export const ToolProfileSchema = Type.Union([
  Type.Literal('deny-all'),
  Type.Literal('readonly'),
  Type.Literal('messaging'),
  Type.Literal('full'),
]);
export type ToolProfile = Static<typeof ToolProfileSchema>;

export const ToolPolicyConfigSchema = Type.Object({
  profile: ToolProfileSchema,
  allow: Type.Optional(Type.Array(Type.String())),
  deny: Type.Optional(Type.Array(Type.String())),
});
export type ToolPolicyConfig = Static<typeof ToolPolicyConfigSchema>;

// ─── Budget ───────────────────────────────────────────────
export const BudgetLimitSchema = Type.Object({
  tokens: Type.Number({ minimum: 0 }),
  cost: Type.Number({ minimum: 0 }),
});

export const BudgetPolicySchema = Type.Object({
  daily: BudgetLimitSchema,
  monthly: BudgetLimitSchema,
  perRun: Type.Object({
    maxTokens: Type.Number({ default: 50_000, minimum: 1000 }),
  }),
  warningThreshold: Type.Number({ default: 0.8, minimum: 0, maximum: 1 }),
  action: Type.Union([
    Type.Literal('pause'),
    Type.Literal('warn'),
    Type.Literal('block'),
  ]),
});
export type BudgetPolicy = Static<typeof BudgetPolicySchema>;

// ─── Model ────────────────────────────────────────────────
export const ModelConfigSchema = Type.Object({
  primary: Type.String({ default: 'anthropic/claude-sonnet-4-6' }),
  failover: Type.Optional(Type.Array(Type.String())),
  compaction: Type.Optional(Type.String()),
  embedding: Type.Optional(Type.String()),
});
export type ModelConfig = Static<typeof ModelConfigSchema>;

// ─── Sub-Agent Defaults ───────────────────────────────────
export const SubagentDefaultsSchema = Type.Object({
  model: Type.String({ default: 'google/gemini-2.5-flash' }),
  maxDepth: Type.Number({ default: 3, minimum: 1, maximum: 10 }),
  maxConcurrent: Type.Number({ default: 5, minimum: 1, maximum: 20 }),
  sandbox: Type.Union([Type.Literal('require'), Type.Literal('inherit')]),
  runTimeoutSeconds: Type.Number({ default: 300 }),
  budget: Type.Union([Type.Literal('inherit'), Type.Literal('none')]),
});
export type SubagentDefaults = Static<typeof SubagentDefaultsSchema>;

// ─── Agent ────────────────────────────────────────────────
export const AgentConfigSchema = Type.Object({
  id: Type.String(),
  default: Type.Optional(Type.Boolean()),
  workspace: Type.String(),
  model: Type.Optional(ModelConfigSchema),
  tools: Type.Optional(ToolPolicyConfigSchema),
  sandbox: Type.Optional(SandboxConfigSchema),
  budget: Type.Optional(BudgetPolicySchema),
  name: Type.Optional(Type.String()),
  avatarUrl: Type.Optional(Type.String()),
  personality: Type.Optional(Type.String()),
  /**
   * Allow this agent to send tool-approval requests via Telegram inline keyboard.
   * Requires messaging.telegram.approvalChatId to be configured.
   * Agents without this flag always fall back to dashboard (WebSocket) approval.
   */
  telegramApproval: Type.Optional(Type.Boolean()),
});
export type AgentConfig = Static<typeof AgentConfigSchema>;

export const AgentDefaultsSchema = Type.Object({
  model: ModelConfigSchema,
  timeoutSeconds: Type.Number({ default: 172_800 }), // 48 hours
  sandbox: SandboxConfigSchema,
  tools: ToolPolicyConfigSchema,
  budget: BudgetPolicySchema,
  subagents: SubagentDefaultsSchema,
});

export const AgentsConfigSchema = Type.Object({
  defaults: AgentDefaultsSchema,
  list: Type.Array(AgentConfigSchema),
});
export type AgentsConfig = Static<typeof AgentsConfigSchema>;

// ─── Memory ───────────────────────────────────────────────
export const MemoryConfigSchema = Type.Object({
  backend: Type.Union([Type.Literal('sqlite-vec'), Type.Literal('none')]),
  compaction: Type.Object({
    threshold: Type.Number({ default: 0.6, minimum: 0.3, maximum: 0.9 }),
    model: Type.String({ default: 'anthropic/claude-haiku-3.5' }),
  }),
});
export type MemoryConfig = Static<typeof MemoryConfigSchema>;

// ─── Cache ────────────────────────────────────────────────
export const CacheConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  backend: Type.Union([Type.Literal('sqlite'), Type.Literal('none')]),
  ttlSeconds: Type.Number({ default: 3600, minimum: 60 }),
});
export type CacheConfig = Static<typeof CacheConfigSchema>;

// ─── MCP ──────────────────────────────────────────────────
export const MCPSecuritySchema = Type.Object({
  sandboxAll: Type.Boolean({ default: true }),
  denyCapabilities: Type.Array(Type.String()),
  perServerBudget: Type.Object({
    dailyTokens: Type.Number({ default: 50_000 }),
  }),
});

export const MCPServerSchema = Type.Object({
  command: Type.String(),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  capabilities: Type.Array(Type.String()),
  sandbox: Type.Boolean({ default: true }),
});

export const MCPConfigSchema = Type.Object({
  servers: Type.Record(Type.String(), MCPServerSchema),
  security: MCPSecuritySchema,
});
export type MCPConfig = Static<typeof MCPConfigSchema>;

// ─── Messaging ────────────────────────────────────────────

export const TelegramConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  /** Agent to handle messages (falls back to default agent) */
  agentId: Type.Optional(Type.String()),
  /** Optional allowlist; empty = accept all chats */
  allowedChatIds: Type.Optional(Type.Array(Type.Number())),
  /** Max concurrent in-flight agent calls per chat (default 1) */
  maxConcurrentPerChat: Type.Number({ default: 1, minimum: 1, maximum: 5 }),
  /**
   * Chat ID of the admin (owner) who will receive tool-approval inline-keyboard
   * messages. Required for Telegram-based approval to work.
   * Find your chat ID by messaging @userinfobot on Telegram.
   */
  approvalChatId: Type.Optional(Type.Number()),
});
export type TelegramConfig = Static<typeof TelegramConfigSchema>;

export const DiscordConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true }),
  agentId: Type.Optional(Type.String()),
  /** Optional guild allowlist; empty = accept all guilds */
  allowedGuildIds: Type.Optional(Type.Array(Type.String())),
  /** Optional channel allowlist; empty = accept all channels */
  allowedChannelIds: Type.Optional(Type.Array(Type.String())),
  /** Prefix for text commands, e.g. "!" → "!ask ..." (default none = mention only) */
  prefix: Type.Optional(Type.String()),
  maxConcurrentPerChannel: Type.Number({ default: 1, minimum: 1, maximum: 5 }),
});
export type DiscordConfig = Static<typeof DiscordConfigSchema>;

export const MessagingConfigSchema = Type.Object({
  telegram: Type.Optional(TelegramConfigSchema),
  discord: Type.Optional(DiscordConfigSchema),
});
export type MessagingConfig = Static<typeof MessagingConfigSchema>;

// ─── Roles & Teams ────────────────────────────────────────
export const RoleSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  responsibilities: Type.Optional(Type.Array(Type.String())),
  systemPromptPrefix: Type.Optional(Type.String()),
  canDelegateTo: Type.Optional(Type.Array(Type.String())),
});
export type RoleConfig = Static<typeof RoleSchema>;

export const TeamMemberSchema = Type.Object({
  agentId: Type.String(),
  roleId: Type.String(),
});

export const TeamSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  leadAgentId: Type.String(),
  members: Type.Array(TeamMemberSchema),
  sharedGoal: Type.Optional(Type.String()),
});
export type TeamConfig = Static<typeof TeamSchema>;

export const TeamsConfigSchema = Type.Object({
  roles: Type.Array(RoleSchema),
  teams: Type.Array(TeamSchema),
});
export type TeamsConfig = Static<typeof TeamsConfigSchema>;

// ─── Notifications ────────────────────────────────────────
export const NotificationsConfigSchema = Type.Object({
  budgetAlerts: Type.Boolean({ default: true }),
  subagentCompletion: Type.Boolean({ default: true }),
  securityAlerts: Type.Boolean({ default: true }),
});
export type NotificationsConfig = Static<typeof NotificationsConfigSchema>;

// ─── Root Config ──────────────────────────────────────────
export const AiDeskConfigSchema = Type.Object({
  gateway: GatewayConfigSchema,
  agents: AgentsConfigSchema,
  mcp: Type.Optional(MCPConfigSchema),
  messaging: Type.Optional(MessagingConfigSchema),
  teams: Type.Optional(TeamsConfigSchema),
  notifications: Type.Optional(NotificationsConfigSchema),
  memory: Type.Optional(MemoryConfigSchema),
  cache: Type.Optional(CacheConfigSchema),
});
export type AiDeskConfig = Static<typeof AiDeskConfigSchema>;
