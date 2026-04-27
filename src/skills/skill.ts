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
}

/** Persisted enable/disable state */
export interface SkillState {
  name: string;
  enabled: boolean;
  installedAt: number;
  filePath: string;
}

/** Fully loaded skill = definition + runtime state */
export interface LoadedSkill {
  definition: SkillDefinition;
  state: SkillState;
}
