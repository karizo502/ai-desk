/**
 * AI_DESK — Skill Definition
 *
 * A skill is a self-contained capability bundle that extends the agent.
 * Each skill lives in a `skills/` directory as a `*.skill.json` file.
 *
 * A skill can contribute any combination of:
 *   - mcpServer    → spawns an external MCP server and injects its tools
 *   - systemPromptAddition → appended to the agent's base system prompt
 *   - toolAllowlist → auto-enables specific tools in policy (on top of profile)
 *
 * Env var interpolation: use ${VAR_NAME} anywhere in string values.
 *
 * --- Autonomous Skill Creation (Phase 1+) ---
 * Generated skills add provenance, metrics, and lifecycle fields.
 * All new fields are optional — existing builtin skills load without them.
 */

export interface SkillMcpServer {
  command: string;
  args?: string[];
  /** Values support ${ENV_VAR} interpolation */
  env?: Record<string, string>;
  /** Tools to expose from this server (empty = all) */
  capabilities: string[];
  sandbox: boolean;
}

/** Usage metrics tracked at runtime for a skill */
export interface SkillMetrics {
  uses: number;
  successes: number;
  failures: number;
  lastUsedAt?: number;
  /** Rolling average of token delta vs baseline (negative = skill saves tokens) */
  avgTokensSaved?: number;
  avgLatencyMs?: number;
}

export interface SkillDefinition {
  /** Unique machine-readable id (kebab-case) */
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  /** Spawns an MCP server and injects its tools into the tool registry */
  mcpServer?: SkillMcpServer;
  /** Text appended to the agent system prompt when this skill is enabled */
  systemPromptAddition?: string;
  /**
   * Tool names to add to the policy allowlist when this skill is enabled.
   * Useful for activating built-in tools (e.g. "fetch_url", "write_file")
   * or MCP tools this skill depends on.
   */
  toolAllowlist?: string[];

  // ── Provenance (generated skills only) ──────────────────────────────────

  /** How this skill was created. Defaults to 'builtin' for existing skills. */
  provenance?: 'builtin' | 'generated' | 'user';
  /** Name of the skill this was derived from (for revisions) */
  parentSkill?: string;
  /** Monotonically increasing revision number. Starts at 1. */
  revision?: number;
  /** Session ID that triggered synthesis of this skill */
  sourceSessionId?: string;
  /** SHA-256 of the trace that was fed to the synthesizer */
  traceHash?: string;
  /** Model ID that synthesized this skill */
  modelId?: string;
  /** Version of the synthesis prompt template used */
  promptTemplateVersion?: string;
  /** Unix ms when this skill was synthesized */
  createdAt?: number;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * 'positive' = adds capability (default).
   * 'avoid' = cautionary pattern — injected as a warning block in the system prompt.
   */
  kind?: 'positive' | 'avoid';
  /** Days of inactivity before auto-archiving. Reads global default if absent. */
  ttlDays?: number;

  // ── Multi-agent scope ────────────────────────────────────────────────────

  /** Visibility scope. Defaults to 'project'. */
  scope?: 'agent' | 'project' | 'global';
  /** If scope='agent', only these agent IDs may use this skill. */
  allowedAgents?: string[];
}

/** Persisted enable/disable state + runtime metrics */
export interface SkillState {
  name: string;
  enabled: boolean;
  installedAt: number;
  filePath: string;
  /** Pending approval before it can be enabled. Only for generated skills. */
  pendingApproval?: boolean;
  metrics?: SkillMetrics;
}

/** Fully loaded skill = definition + runtime state */
export interface LoadedSkill {
  definition: SkillDefinition;
  state: SkillState;
}
