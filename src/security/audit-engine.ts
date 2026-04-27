/**
 * AI_DESK — Security Audit Engine
 *
 * Automated security checks for the gateway installation.
 * Run via: ai-desk security audit
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuditLog } from './audit-log.js';
import type { AiDeskConfig } from '../config/schema.js';

export interface AuditCheckResult {
  id: string;
  category: AuditCategory;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

type AuditCategory =
  | 'gateway'
  | 'auth'
  | 'tools'
  | 'sandbox'
  | 'secrets'
  | 'models'
  | 'subagents'
  | 'budget'
  | 'cache'
  | 'memory'
  | 'audit_log'
  | 'filesystem'
  | 'mcp'
  | 'orchestration'
  | 'messaging';

export class AuditEngine {
  private config: AiDeskConfig;
  private dataDir: string;

  constructor(config: AiDeskConfig, dataDir: string) {
    this.config = config;
    this.dataDir = dataDir;
  }

  /** Run all security checks */
  async runFullAudit(): Promise<{
    results: AuditCheckResult[];
    score: number;
    passed: number;
    warned: number;
    failed: number;
  }> {
    const results: AuditCheckResult[] = [
      ...this.checkGateway(),
      ...this.checkAuth(),
      ...this.checkTools(),
      ...this.checkSandbox(),
      ...this.checkSecrets(),
      ...this.checkModels(),
      ...this.checkSubagents(),
      ...this.checkBudget(),
      ...this.checkCache(),
      ...this.checkMemory(),
      ...this.checkAuditLog(),
      ...this.checkFilesystem(),
      ...this.checkMcp(),
      ...this.checkOrchestration(),
      ...this.checkMessaging(),
    ];

    const passed = results.filter(r => r.status === 'pass').length;
    const warned = results.filter(r => r.status === 'warn').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const total = results.length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    return { results, score, passed, warned, failed };
  }

  // ─── Gateway Checks ──────────────────────────────────────

  private checkGateway(): AuditCheckResult[] {
    const results: AuditCheckResult[] = [];

    // Bind address
    results.push({
      id: 'gw-bind',
      category: 'gateway',
      name: 'Gateway bind address',
      status: this.config.gateway.bind === '127.0.0.1' ? 'pass' : 'warn',
      detail: this.config.gateway.bind === '127.0.0.1'
        ? 'Gateway bound to localhost only (secure)'
        : `Gateway bound to ${this.config.gateway.bind} — exposed to network`,
    });

    // Rate limiting
    results.push({
      id: 'gw-ratelimit',
      category: 'gateway',
      name: 'Rate limiting enabled',
      status: this.config.gateway.rateLimit.maxPerSecond > 0 ? 'pass' : 'fail',
      detail: `Rate limit: ${this.config.gateway.rateLimit.maxPerSecond} req/s`,
    });

    // Frame size limit
    results.push({
      id: 'gw-framesize',
      category: 'gateway',
      name: 'Frame size limit',
      status: this.config.gateway.maxFrameSize <= 10_485_760 ? 'pass' : 'warn',
      detail: `Max frame size: ${(this.config.gateway.maxFrameSize / 1024 / 1024).toFixed(1)}MB`,
    });

    return results;
  }

  // ─── Auth Checks ──────────────────────────────────────────

  private checkAuth(): AuditCheckResult[] {
    const results: AuditCheckResult[] = [];

    // Auth mode (there is no 'none', but double-check)
    results.push({
      id: 'auth-mode',
      category: 'auth',
      name: 'Authentication required',
      status: 'pass', // Always true — 'none' doesn't exist in schema
      detail: `Auth mode: ${this.config.gateway.auth.mode}`,
    });

    // Lockout settings
    results.push({
      id: 'auth-lockout',
      category: 'auth',
      name: 'Brute-force protection',
      status: this.config.gateway.auth.maxFailedAttempts <= 10 ? 'pass' : 'warn',
      detail: `Lockout after ${this.config.gateway.auth.maxFailedAttempts} attempts for ${this.config.gateway.auth.lockoutDurationMs / 1000}s`,
    });

    // Master key set
    const masterKeySet = !!process.env.AI_DESK_MASTER_KEY &&
                          process.env.AI_DESK_MASTER_KEY.length >= 16;
    results.push({
      id: 'auth-masterkey',
      category: 'auth',
      name: 'Master encryption key configured',
      status: masterKeySet ? 'pass' : 'fail',
      detail: masterKeySet
        ? 'Master key is set and meets minimum length'
        : 'AI_DESK_MASTER_KEY is not set or too short (min 16 chars)',
    });

    return results;
  }

  // ─── Tool Policy Checks ───────────────────────────────────

  private checkTools(): AuditCheckResult[] {
    const profile = this.config.agents.defaults.tools.profile;
    return [{
      id: 'tools-profile',
      category: 'tools',
      name: 'Default tool policy',
      status: profile === 'deny-all' ? 'pass' :
              profile === 'readonly' ? 'pass' :
              profile === 'messaging' ? 'warn' : 'fail',
      detail: `Default tool profile: ${profile}`,
    }];
  }

  // ─── Sandbox Checks ───────────────────────────────────────

  private checkSandbox(): AuditCheckResult[] {
    const mode = this.config.agents.defaults.sandbox.mode;
    return [{
      id: 'sandbox-mode',
      category: 'sandbox',
      name: 'Sandbox default mode',
      status: mode === 'all' ? 'pass' : 'warn',
      detail: `Sandbox mode: ${mode}`,
    }];
  }

  // ─── Secrets Checks ───────────────────────────────────────

  private checkSecrets(): AuditCheckResult[] {
    const results: AuditCheckResult[] = [];

    // Check for .env file permissions (existence check)
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      results.push({
        id: 'secrets-envfile',
        category: 'secrets',
        name: '.env file exists',
        status: 'pass',
        detail: '.env file found — ensure it contains no production secrets in plaintext',
      });
    }

    // Check no plaintext API keys in config
    const configPath = resolve(process.cwd(), 'ai-desk.json');
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const hasPlaintextKey = /["\']?(sk-|key-|AIza)[a-zA-Z0-9_-]{20,}["\']?/.test(content);
      results.push({
        id: 'secrets-plaintext',
        category: 'secrets',
        name: 'No plaintext API keys in config',
        status: hasPlaintextKey ? 'fail' : 'pass',
        detail: hasPlaintextKey
          ? 'CRITICAL: Plaintext API key detected in ai-desk.json'
          : 'No plaintext API keys found in config',
      });
    }

    return results;
  }

  // ─── Model Checks ─────────────────────────────────────────

  private checkModels(): AuditCheckResult[] {
    const model = this.config.agents.defaults.model;
    return [{
      id: 'models-failover',
      category: 'models',
      name: 'Model failover configured',
      status: model.failover && model.failover.length > 0 ? 'pass' : 'warn',
      detail: model.failover
        ? `Failover chain: ${model.failover.join(' → ')}`
        : 'No failover configured — single point of failure',
    }];
  }

  // ─── Sub-Agent Checks ─────────────────────────────────────

  private checkSubagents(): AuditCheckResult[] {
    const sa = this.config.agents.defaults.subagents;
    const results: AuditCheckResult[] = [];

    results.push({
      id: 'sa-depth',
      category: 'subagents',
      name: 'Sub-agent depth limit',
      status: sa.maxDepth <= 5 ? 'pass' : 'warn',
      detail: `Max depth: ${sa.maxDepth} (recommended: ≤ 3)`,
    });

    results.push({
      id: 'sa-sandbox',
      category: 'subagents',
      name: 'Sub-agent sandbox enforcement',
      status: sa.sandbox === 'require' ? 'pass' : 'fail',
      detail: `Sub-agent sandbox: ${sa.sandbox}`,
    });

    results.push({
      id: 'sa-concurrent',
      category: 'subagents',
      name: 'Sub-agent concurrency limit',
      status: sa.maxConcurrent <= 10 ? 'pass' : 'warn',
      detail: `Max concurrent: ${sa.maxConcurrent}`,
    });

    return results;
  }

  // ─── Budget Checks ────────────────────────────────────────

  private checkBudget(): AuditCheckResult[] {
    const b = this.config.agents.defaults.budget;
    const results: AuditCheckResult[] = [];

    results.push({
      id: 'budget-action',
      category: 'budget',
      name: 'Budget hard-stop action',
      status: b.action === 'pause' || b.action === 'block' ? 'pass'
            : b.action === 'warn' ? 'warn' : 'fail',
      detail: `Budget overrun action: ${b.action}` +
              (b.action === 'warn' ? ' (warns only — no enforcement)' : ''),
    });

    results.push({
      id: 'budget-perrun',
      category: 'budget',
      name: 'Per-run token cap',
      status: b.perRun.maxTokens <= 200_000 ? 'pass' : 'warn',
      detail: `Per-run cap: ${b.perRun.maxTokens.toLocaleString()} tokens`,
    });

    return results;
  }

  // ─── Cache Checks ─────────────────────────────────────────

  private checkCache(): AuditCheckResult[] {
    const cache = this.config.cache;
    if (!cache) {
      return [{
        id: 'cache-config',
        category: 'cache',
        name: 'Response cache configured',
        status: 'warn',
        detail: 'No cache config found — using defaults',
      }];
    }

    return [{
      id: 'cache-enabled',
      category: 'cache',
      name: 'Response cache enabled',
      status: cache.enabled ? 'pass' : 'warn',
      detail: cache.enabled
        ? `Cache: ${cache.backend}, TTL ${cache.ttlSeconds}s`
        : 'Cache disabled — every call hits the model (token-inefficient)',
    }];
  }

  // ─── Memory Checks ────────────────────────────────────────

  private checkMemory(): AuditCheckResult[] {
    const mem = this.config.memory;
    if (!mem) return [];
    return [{
      id: 'memory-backend',
      category: 'memory',
      name: 'Memory backend implemented',
      status: mem.backend === 'sqlite-vec' ? 'warn' : 'pass',
      detail: mem.backend === 'sqlite-vec'
        ? '"sqlite-vec" is not yet implemented — compactor runs as "none" (text-only summarisation). Change to "none" to suppress this warning.'
        : `Memory backend: ${mem.backend}`,
    }];
  }

  // ─── Audit Log Checks ─────────────────────────────────────

  private checkAuditLog(): AuditCheckResult[] {
    const results: AuditCheckResult[] = [];

    try {
      const auditLog = new AuditLog(this.dataDir);
      const integrity = auditLog.verifyIntegrity();
      auditLog.close();

      results.push({
        id: 'audit-integrity',
        category: 'audit_log',
        name: 'Audit log integrity',
        status: integrity.valid ? 'pass' : 'fail',
        detail: integrity.valid
          ? `Audit log intact (${integrity.totalEntries} entries)`
          : `TAMPERED: Chain broken at entry ${integrity.brokenAt} — ${integrity.detail}`,
      });
    } catch {
      results.push({
        id: 'audit-integrity',
        category: 'audit_log',
        name: 'Audit log integrity',
        status: 'warn',
        detail: 'Could not verify audit log (may not exist yet)',
      });
    }

    return results;
  }

  // ─── Filesystem Checks ────────────────────────────────────

  private checkFilesystem(): AuditCheckResult[] {
    const results: AuditCheckResult[] = [];

    // Data directory exists
    results.push({
      id: 'fs-datadir',
      category: 'filesystem',
      name: 'Data directory',
      status: existsSync(this.dataDir) ? 'pass' : 'warn',
      detail: `Data dir: ${this.dataDir}`,
    });

    return results;
  }

  // ─── MCP Checks ───────────────────────────────────────────

  private checkMcp(): AuditCheckResult[] {
    const mcp = this.config.mcp;
    if (!mcp) {
      return [{
        id: 'mcp-config',
        category: 'mcp',
        name: 'MCP integration',
        status: 'pass',
        detail: 'No MCP servers configured (not required)',
      }];
    }

    const results: AuditCheckResult[] = [];
    const serverCount = Object.keys(mcp.servers).length;

    results.push({
      id: 'mcp-sandbox',
      category: 'mcp',
      name: 'MCP sandbox enforcement',
      status: mcp.security.sandboxAll ? 'pass' : 'fail',
      detail: mcp.security.sandboxAll
        ? `All ${serverCount} MCP server(s) run in sandbox`
        : 'RISK: MCP tools not sandboxed — external server code runs unsandboxed',
    });

    results.push({
      id: 'mcp-budget',
      category: 'mcp',
      name: 'MCP per-server token budget',
      status: mcp.security.perServerBudget.dailyTokens > 0 ? 'pass' : 'warn',
      detail: `Per-server daily budget: ${mcp.security.perServerBudget.dailyTokens.toLocaleString()} tokens`,
    });

    return results;
  }

  // ─── Messaging Checks ─────────────────────────────────────

  private checkMessaging(): AuditCheckResult[] {
    const msg = this.config.messaging;
    if (!msg) return [];

    const results: AuditCheckResult[] = [];

    if (msg.telegram?.enabled) {
      const tokenSet = !!process.env.TELEGRAM_BOT_TOKEN;
      results.push({
        id: 'msg-telegram-token',
        category: 'messaging',
        name: 'Telegram bot token',
        status: tokenSet ? 'pass' : 'fail',
        detail: tokenSet
          ? 'TELEGRAM_BOT_TOKEN is set'
          : 'TELEGRAM_BOT_TOKEN is not set — Telegram adapter will fail to start',
      });

      const allowedChats = msg.telegram.allowedChatIds ?? [];
      results.push({
        id: 'msg-telegram-allowlist',
        category: 'messaging',
        name: 'Telegram chat allowlist',
        status: allowedChats.length > 0 ? 'pass' : 'warn',
        detail: allowedChats.length > 0
          ? `Allowed chats: ${allowedChats.join(', ')}`
          : 'No chat allowlist — bot will respond to ALL Telegram users',
      });
    }

    if (msg.discord?.enabled) {
      const tokenSet = !!process.env.DISCORD_BOT_TOKEN;
      results.push({
        id: 'msg-discord-token',
        category: 'messaging',
        name: 'Discord bot token',
        status: tokenSet ? 'pass' : 'fail',
        detail: tokenSet
          ? 'DISCORD_BOT_TOKEN is set'
          : 'DISCORD_BOT_TOKEN is not set — Discord adapter will fail to start',
      });

      const guilds = msg.discord.allowedGuildIds ?? [];
      results.push({
        id: 'msg-discord-allowlist',
        category: 'messaging',
        name: 'Discord guild allowlist',
        status: guilds.length > 0 ? 'pass' : 'warn',
        detail: guilds.length > 0
          ? `Allowed guilds: ${guilds.join(', ')}`
          : 'No guild allowlist — bot will respond in ALL servers it joins',
      });
    }

    return results;
  }

  // ─── Orchestration Checks ─────────────────────────────────

  private checkOrchestration(): AuditCheckResult[] {
    const sa = this.config.agents.defaults.subagents;
    const results: AuditCheckResult[] = [{
      id: 'orch-depth',
      category: 'orchestration',
      name: 'Orchestration depth limit (inherited from sub-agents)',
      status: sa.maxDepth <= 3 ? 'pass' : 'warn',
      detail: `Max orchestration depth: ${sa.maxDepth} (recommended: ≤ 3 to prevent runaway chains)`,
    }];

    // Team checks
    const teams = this.config.teams;
    if (teams && teams.teams.length > 0) {
      const agentIds = new Set(this.config.agents.list.map(a => a.id));
      const roleIds = new Set(teams.roles.map(r => r.id));

      for (const team of teams.teams) {
        if (!agentIds.has(team.leadAgentId)) {
          results.push({
            id: `team-lead-missing-${team.id}`,
            category: 'orchestration',
            name: `Team "${team.id}" lead agent exists`,
            status: 'fail',
            detail: `Lead agent "${team.leadAgentId}" is not in agents.list`,
          });
        }
        for (const m of team.members) {
          if (!agentIds.has(m.agentId)) {
            results.push({
              id: `team-member-missing-${team.id}-${m.agentId}`,
              category: 'orchestration',
              name: `Team "${team.id}" member "${m.agentId}" exists`,
              status: 'fail',
              detail: `Member agent "${m.agentId}" is not in agents.list`,
            });
          }
          if (!roleIds.has(m.roleId)) {
            results.push({
              id: `team-role-missing-${team.id}-${m.roleId}`,
              category: 'orchestration',
              name: `Team "${team.id}" role "${m.roleId}" defined`,
              status: 'warn',
              detail: `Role "${m.roleId}" is not in teams.roles — member will have no role prompt`,
            });
          }
        }
      }
    }

    return results;
  }
}
