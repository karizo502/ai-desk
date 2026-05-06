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
import { checkGeneratedSkillDefinition } from './skill.schema.js';
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
    const loaded = [...this.skills.values()].filter(s => s.state.enabled && s.definition.systemPromptAddition);
    return buildPrompt(BASE_SYSTEM_PROMPT, loaded);
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
  agentToolAllowlist(agentSkills: string[], agentId?: string): string[] {
    const names: string[] = [];
    for (const skillName of agentSkills) {
      const skill = this.skills.get(skillName);
      if (!skill || !skill.state.enabled || !skill.definition.toolAllowlist) continue;
      if (!isScopeAllowed(skill.definition, agentId)) continue;
      names.push(...skill.definition.toolAllowlist);
    }
    return [...new Set(names)];
  }

  /**
   * Composed system prompt for a specific agent based on its declared skill names.
   * Only skills that are both enabled globally AND listed in agentSkills are included.
   */
  agentSystemPrompt(agentSkills: string[], agentId?: string): string {
    const loaded = agentSkills
      .map(name => this.skills.get(name))
      .filter((s): s is LoadedSkill =>
        !!s && s.state.enabled &&
        !!s.definition.systemPromptAddition &&
        isScopeAllowed(s.definition, agentId),
      );
    return buildPrompt(BASE_SYSTEM_PROMPT, loaded);
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

  /**
   * Register a generated skill. Enforces security invariants via typebox.
   * Always disabled (pendingApproval) until explicitly approved.
   */
  registerGenerated(
    definition: SkillDefinition,
    filePath: string,
    actor?: { connectionId?: string; remoteAddress?: string },
  ): void {
    const errors = checkGeneratedSkillDefinition(definition);
    if (errors) {
      throw new Error(`Generated skill validation failed:\n${errors.join('\n')}`);
    }

    const skillState: SkillState = {
      name: definition.name,
      enabled: false,
      pendingApproval: true,
      installedAt: Date.now(),
      filePath,
      metrics: { uses: 0, successes: 0, failures: 0 },
    };
    this.skills.set(definition.name, { definition, state: skillState });
    this.saveState();
    eventBus.emit('skills:generated', { name: definition.name, ...(actor ?? {}) });
  }

  /** Approve a pending generated skill (enables it) */
  approve(
    name: string,
    actor?: { connectionId?: string; remoteAddress?: string },
  ): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.state.pendingApproval = false;
    skill.state.enabled = true;
    this.saveState();
    eventBus.emit('skills:approved', { name, ...(actor ?? {}) });
    return true;
  }

  /** Reject and archive a pending generated skill */
  reject(
    name: string,
    actor?: { connectionId?: string; remoteAddress?: string },
  ): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.state.pendingApproval = false;
    skill.state.enabled = false;
    this.saveState();
    eventBus.emit('skills:rejected', { name, ...(actor ?? {}) });
    return true;
  }

  /** Archive a skill (disabled + marked archived) */
  archive(
    name: string,
    actor?: { connectionId?: string; remoteAddress?: string },
  ): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.state.enabled = false;
    skill.state.pendingApproval = false;
    this.skills.delete(name);
    this.saveState();
    eventBus.emit('skills:archived', { name, ...(actor ?? {}) });
    return true;
  }

  /** Record a usage event for metrics tracking */
  recordUsage(name: string, success: boolean, tokenDelta?: number): void {
    const skill = this.skills.get(name);
    if (!skill) return;

    const m = skill.state.metrics ?? { uses: 0, successes: 0, failures: 0 };
    m.uses++;
    if (success) m.successes++; else m.failures++;
    m.lastUsedAt = Date.now();

    if (tokenDelta !== undefined) {
      const prev = m.avgTokensSaved ?? 0;
      // Exponential moving average (α=0.2)
      m.avgTokensSaved = prev * 0.8 + tokenDelta * 0.2;
    }

    skill.state.metrics = m;
    this.saveState();
  }

  /** All generated skills */
  listGenerated(): LoadedSkill[] {
    return [...this.skills.values()]
      .filter(s => s.definition.provenance === 'generated');
  }

  /** Generated skills waiting for user approval */
  listPendingApproval(): LoadedSkill[] {
    return [...this.skills.values()]
      .filter(s => s.state.pendingApproval === true);
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

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Build the final system prompt string from a base and a list of loaded skills.
 * - kind='positive' skills → appended as capability additions
 * - kind='avoid'   skills → gathered into a separate "AVOID" cautionary block
 */
function buildPrompt(base: string, skills: LoadedSkill[]): string {
  const positive = skills
    .filter(s => (s.definition.kind ?? 'positive') === 'positive')
    .map(s => s.definition.systemPromptAddition!.trim());

  const avoid = skills
    .filter(s => s.definition.kind === 'avoid')
    .map(s => s.definition.systemPromptAddition!.trim());

  let result = base;
  if (positive.length > 0) result += '\n\n' + positive.join('\n\n');
  if (avoid.length > 0) {
    result += '\n\n## AVOID the following patterns (learned from past failures)\n\n' +
      avoid.map(a => `- ${a}`).join('\n');
  }
  return result;
}

/**
 * Returns true if this skill's scope permits the given agentId.
 * undefined agentId = no filtering (gateway/global context).
 */
function isScopeAllowed(def: SkillDefinition, agentId?: string): boolean {
  const scope = def.scope ?? 'project';
  if (scope === 'global') return true;
  if (scope === 'project') return true;
  // scope === 'agent': only allowed agents may use this skill
  if (!agentId) return true; // no agent context = allow (backward compat)
  return (def.allowedAgents ?? []).includes(agentId);
}
