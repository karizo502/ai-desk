/**
 * AI_DESK — Tool Policy Engine
 *
 * Default: deny-all. Every tool must be explicitly allowed.
 * Supports profiles, per-tool overrides, and session-scoped exceptions.
 */
import { eventBus } from '../shared/events.js';
import type { ToolPolicyConfig, ToolProfile } from '../config/schema.js';
import type { ToolRequest } from '../shared/types.js';

/** Built-in profile definitions */
const PROFILE_RULES: Record<ToolProfile, { allow: string[]; deny: string[] }> = {
  'deny-all': {
    allow: [],
    deny: ['*'],
  },
  'readonly': {
    // Wildcards: read* matches read_file, list* matches list_files, etc.
    allow: ['read*', 'list*', 'view*', 'search*', 'stat*', 'count*', 'grep', 'glob', 'fetch_url'],
    deny:  ['write*', 'delete*', 'exec*', 'edit*', 'create*', 'send*'],
  },
  'messaging': {
    allow: ['read*', 'list*', 'view*', 'search*', 'message*', 'reaction*', 'send*'],
    deny:  ['exec*', 'write*', 'delete*', 'edit*', 'create*'],
  },
  'full': {
    allow: ['*'],
    deny: [],
  },
};

interface PolicyOverride {
  sessionId: string;
  toolName: string;
  allowed: boolean;
  expiresAt: number;
  approvedBy: string;
}

export class PolicyEngine {
  private config: ToolPolicyConfig;
  private overrides = new Map<string, PolicyOverride>();
  /** Global skill allowlist (fallback for agents with no skills field) */
  private skillAllowlist: Set<string> = new Set();
  /** Per-agent skill allowlist: agentId → Set of tool names */
  private agentSkillAllowlists = new Map<string, Set<string>>();

  constructor(config: ToolPolicyConfig) {
    this.config = config;
  }

  /** Called by SkillRegistry to add skill-provided tool allowlist entries */
  addSkillAllowlist(toolNames: string[]): void {
    for (const name of toolNames) this.skillAllowlist.add(name);
  }

  /** Replace global skill allowlist (call after skill enable/disable) */
  setSkillAllowlist(toolNames: string[]): void {
    this.skillAllowlist = new Set(toolNames);
  }

  /** Set skill allowlist for a specific agent (overrides global for that agent) */
  setAgentSkillAllowlist(agentId: string, toolNames: string[]): void {
    this.agentSkillAllowlists.set(agentId, new Set(toolNames));
  }

  /** Clear per-agent allowlist (e.g. agent removed) */
  clearAgentSkillAllowlist(agentId: string): void {
    this.agentSkillAllowlists.delete(agentId);
  }

  /**
   * Check if a tool call is allowed.
   * Order: session override > per-tool config > profile default
   */
  checkPermission(request: ToolRequest): {
    allowed: boolean;
    reason: string;
    requiresApproval: boolean;
  } {
    const { name, sessionId, agentId } = request;

    // 1. Check session-scoped overrides
    const overrideKey = `${sessionId}:${name}`;
    const override = this.overrides.get(overrideKey);
    if (override && Date.now() < override.expiresAt) {
      return {
        allowed: override.allowed,
        reason: `Session override by ${override.approvedBy}`,
        requiresApproval: false,
      };
    }

    // 2. Check per-tool deny list (explicit deny always wins)
    if (this.config.deny?.some(pattern => this.matchTool(name, pattern))) {
      eventBus.emit('tool:denied', { tool: name, sessionId, agentId, reason: 'explicit deny' });
      return {
        allowed: false,
        reason: `Tool "${name}" is explicitly denied`,
        requiresApproval: false,
      };
    }

    // 3. Check per-tool allow list + skill allowlist (per-agent takes priority over global)
    const effectiveSkillAllowlist = agentId && this.agentSkillAllowlists.has(agentId)
      ? this.agentSkillAllowlists.get(agentId)!
      : this.skillAllowlist;
    if (this.config.allow?.some(pattern => this.matchTool(name, pattern)) ||
        effectiveSkillAllowlist.has(name)) {
      return {
        allowed: true,
        reason: `Tool "${name}" is explicitly allowed`,
        requiresApproval: false,
      };
    }

    // 4. Check profile rules
    const profile = PROFILE_RULES[this.config.profile];

    // Deny-all: nothing is allowed unless explicitly listed
    if (profile.deny.includes('*')) {
      if (!profile.allow.some(pattern => this.matchTool(name, pattern))) {
        eventBus.emit('tool:denied', { tool: name, sessionId, agentId, reason: 'deny-all profile' });
        return {
          allowed: false,
          reason: `Tool "${name}" blocked by deny-all policy. Requires explicit allowlisting.`,
          requiresApproval: true,
        };
      }
    }

    // Allow-all: everything allowed unless explicitly denied
    if (profile.allow.includes('*')) {
      if (profile.deny.some(pattern => this.matchTool(name, pattern))) {
        eventBus.emit('tool:denied', { tool: name, sessionId, agentId, reason: 'profile deny' });
        return {
          allowed: false,
          reason: `Tool "${name}" denied by profile rule`,
          requiresApproval: false,
        };
      }
      return {
        allowed: true,
        reason: `Tool "${name}" allowed by profile`,
        requiresApproval: false,
      };
    }

    // Specific profile: check allow list
    if (profile.allow.some(pattern => this.matchTool(name, pattern))) {
      return {
        allowed: true,
        reason: `Tool "${name}" allowed by "${this.config.profile}" profile`,
        requiresApproval: false,
      };
    }

    // Default: deny
    eventBus.emit('tool:denied', { tool: name, sessionId, agentId, reason: 'not in allow list' });
    return {
      allowed: false,
      reason: `Tool "${name}" not in allow list for "${this.config.profile}" profile`,
      requiresApproval: true,
    };
  }

  /** Grant a temporary tool override for a session */
  grantOverride(
    sessionId: string,
    toolName: string,
    approvedBy: string,
    durationMs: number = 3_600_000 // 1 hour
  ): void {
    const key = `${sessionId}:${toolName}`;
    this.overrides.set(key, {
      sessionId,
      toolName,
      allowed: true,
      expiresAt: Date.now() + durationMs,
      approvedBy,
    });
  }

  /** Revoke a session override */
  revokeOverride(sessionId: string, toolName: string): void {
    this.overrides.delete(`${sessionId}:${toolName}`);
  }

  /** Simple glob-like tool name matching */
  private matchTool(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return toolName.startsWith(pattern.slice(0, -1));
    }
    return toolName === pattern;
  }

  /** Create a child policy for sub-agents (children ≤ parent) */
  createChildPolicy(parentPolicy: ToolPolicyConfig): PolicyEngine {
    // Child inherits parent's profile, but can only be MORE restrictive
    const childConfig: ToolPolicyConfig = {
      profile: parentPolicy.profile === 'full' ? 'readonly' : parentPolicy.profile,
      allow: parentPolicy.allow, // Same allow list
      deny: parentPolicy.deny,   // Same deny list
    };
    return new PolicyEngine(childConfig);
  }
}
