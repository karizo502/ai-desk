/**
 * AI_DESK — Skill Registry
 *
 * Manages installed skills: persists enable/disable state, composes the
 * system prompt from enabled skill additions, and builds the MCP server
 * map for McpRegistry to start.
 *
 * State is stored in <dataDir>/skills-state.json (plain JSON — not sensitive).
 * Skill definitions themselves live in skills/*.skill.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SkillLoader } from './skill-loader.js';
import type { SkillDefinition, SkillState, LoadedSkill } from './skill.js';
import { eventBus } from '../shared/events.js';

const STATE_FILE = 'skills-state.json';

const BASE_SYSTEM_PROMPT =
  'You are AI_DESK, a security-first AI assistant running in a sandboxed gateway. ' +
  'Be concise. Use tools when needed; do not invent information. ' +
  'If a tool is denied, explain that the user must approve it via the AI_DESK approval flow.';

export class SkillRegistry {
  private dataDir: string;
  private loader: SkillLoader;
  private skills = new Map<string, LoadedSkill>();
  private stateFile: string;

  constructor(dataDir: string, skillsDir?: string | string[]) {
    this.dataDir = dataDir;
    this.loader = new SkillLoader(skillsDir);
    this.stateFile = join(dataDir, STATE_FILE);
  }

  /** Discover skills from disk and merge with saved state */
  async init(): Promise<void> {
    const state = this.loadState();
    const discovered = await this.loader.loadAll();

    for (const { definition, filePath } of discovered) {
      const existing = state[definition.name];
      const skillState: SkillState = existing ?? {
        name: definition.name,
        enabled: false, // disabled by default — explicit opt-in
        installedAt: Date.now(),
        filePath,
      };
      skillState.filePath = filePath; // keep path fresh in case file moved
      this.skills.set(definition.name, { definition, state: skillState });
    }

    this.saveState();
    eventBus.emit('skills:loaded', { count: this.skills.size });
  }

  /** All loaded skills */
  list(): LoadedSkill[] {
    return [...this.skills.values()];
  }

  /** Get one skill by name */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  enable(name: string, actor?: { connectionId?: string; remoteAddress?: string }): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.state.enabled = true;
    this.saveState();
    eventBus.emit('skills:enabled', { name, ...(actor ?? {}) });
    return true;
  }

  disable(name: string, actor?: { connectionId?: string; remoteAddress?: string }): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.state.enabled = false;
    this.saveState();
    eventBus.emit('skills:disabled', { name, ...(actor ?? {}) });
    return true;
  }

  /**
   * Compose the full system prompt from base + all enabled skill additions.
   * Call this to get the prompt to pass to AgentRuntime.
   */
  composedSystemPrompt(): string {
    const additions = [...this.skills.values()]
      .filter(s => s.state.enabled && s.definition.systemPromptAddition)
      .map(s => s.definition.systemPromptAddition!.trim());

    if (additions.length === 0) return BASE_SYSTEM_PROMPT;
    return BASE_SYSTEM_PROMPT + '\n\n' + additions.join('\n\n');
  }

  /**
   * Build the MCP servers map for McpRegistry.
   * Returns config entries for all enabled skills that declare an mcpServer.
   */
  mcpServersFromSkills(): Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    capabilities: string[];
    sandbox: boolean;
  }> {
    const servers: ReturnType<typeof this.mcpServersFromSkills> = {};

    for (const { definition, state } of this.skills.values()) {
      if (!state.enabled || !definition.mcpServer) continue;
      servers[`skill:${definition.name}`] = {
        command: definition.mcpServer.command,
        args: definition.mcpServer.args,
        env: definition.mcpServer.env,
        capabilities: definition.mcpServer.capabilities,
        sandbox: definition.mcpServer.sandbox,
      };
    }

    return servers;
  }

  /**
   * Collect all tool names that enabled skills want auto-allowlisted.
   * The caller (gateway / policy engine) merges this into the effective allowlist.
   */
  toolAllowlist(): string[] {
    const names: string[] = [];
    for (const { definition, state } of this.skills.values()) {
      if (!state.enabled || !definition.toolAllowlist) continue;
      names.push(...definition.toolAllowlist);
    }
    return [...new Set(names)];
  }

  /**
   * Tool allowlist for a specific agent based on its declared skill names.
   * Only skills that are both enabled globally AND listed in agentSkills are included.
   */
  agentToolAllowlist(agentSkills: string[]): string[] {
    const names: string[] = [];
    for (const skillName of agentSkills) {
      const skill = this.skills.get(skillName);
      if (!skill || !skill.state.enabled || !skill.definition.toolAllowlist) continue;
      names.push(...skill.definition.toolAllowlist);
    }
    return [...new Set(names)];
  }

  /**
   * Composed system prompt for a specific agent based on its declared skill names.
   * Only skills that are both enabled globally AND listed in agentSkills are included.
   */
  agentSystemPrompt(agentSkills: string[]): string {
    const additions = agentSkills
      .map(name => this.skills.get(name))
      .filter((s): s is LoadedSkill => !!s && s.state.enabled && !!s.definition.systemPromptAddition)
      .map(s => s.definition.systemPromptAddition!.trim());

    if (additions.length === 0) return BASE_SYSTEM_PROMPT;
    return BASE_SYSTEM_PROMPT + '\n\n' + additions.join('\n\n');
  }

  /** Register a skill definition that was loaded externally (for testing) */
  registerExternal(definition: SkillDefinition, filePath: string): void {
    const existing = this.skills.get(definition.name);
    const skillState: SkillState = existing?.state ?? {
      name: definition.name,
      enabled: false,
      installedAt: Date.now(),
      filePath,
    };
    this.skills.set(definition.name, { definition, state: skillState });
    this.saveState();
  }

  // ─── State persistence ───────────────────────────────────

  private loadState(): Record<string, SkillState> {
    if (!existsSync(this.stateFile)) return {};
    try {
      return JSON.parse(readFileSync(this.stateFile, 'utf-8')) as Record<string, SkillState>;
    } catch {
      return {};
    }
  }

  private saveState(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    const state: Record<string, SkillState> = {};
    for (const [name, skill] of this.skills) {
      state[name] = skill.state;
    }
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }
}
