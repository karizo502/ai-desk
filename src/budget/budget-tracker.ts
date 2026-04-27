/**
 * AI_DESK — Budget Tracker
 *
 * Hard-stop enforcement for daily/monthly token + cost budgets.
 * Persisted to SQLite so usage survives restarts.
 *
 * Behavior on overrun:
 *   - 'pause': agent pauses (current run finishes, no new runs)
 *   - 'warn':  events emitted, no enforcement
 *   - 'block': new requests rejected immediately
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { eventBus } from '../shared/events.js';
import type { BudgetPolicy } from '../config/schema.js';

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  warning?: string;
  paused: boolean;
  daily: { used: number; limit: number; pctUsed: number };
  monthly: { used: number; limit: number; pctUsed: number };
}

export interface UsageRecord {
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
}

export class BudgetTracker {
  private db: Database.Database;
  private policy: BudgetPolicy;
  private pausedAgents = new Set<string>();
  private lastWarning = new Map<string, number>(); // agentId → period_pct (avoid log spam)

  constructor(dataDir: string, policy: BudgetPolicy) {
    this.policy = policy;
    const dbDir = resolve(dataDir, 'budget');
    mkdirSync(dbDir, { recursive: true });

    this.db = new Database(resolve(dbDir, 'budget.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage(agent_id);
    `);
  }

  /** Check whether a request can proceed under current budget */
  check(agentId: string, estimatedTokens: number = 0): BudgetCheck {
    const daily = this.usageInPeriod(agentId, 'daily');
    const monthly = this.usageInPeriod(agentId, 'monthly');

    const dailyTokensUsed = daily.tokens;
    const monthlyTokensUsed = monthly.tokens;

    const dailyLimit = this.policy.daily.tokens;
    const monthlyLimit = this.policy.monthly.tokens;

    const result: BudgetCheck = {
      allowed: true,
      paused: this.pausedAgents.has(agentId),
      daily: {
        used: dailyTokensUsed,
        limit: dailyLimit,
        pctUsed: dailyLimit > 0 ? dailyTokensUsed / dailyLimit : 0,
      },
      monthly: {
        used: monthlyTokensUsed,
        limit: monthlyLimit,
        pctUsed: monthlyLimit > 0 ? monthlyTokensUsed / monthlyLimit : 0,
      },
    };

    if (this.pausedAgents.has(agentId)) {
      result.allowed = false;
      result.reason = `Agent "${agentId}" is paused due to budget overrun`;
      return result;
    }

    const projectedDaily = dailyTokensUsed + estimatedTokens;
    const projectedMonthly = monthlyTokensUsed + estimatedTokens;

    // Per-run cap (always enforced regardless of action)
    if (estimatedTokens > this.policy.perRun.maxTokens) {
      result.allowed = false;
      result.reason = `Estimated tokens (${estimatedTokens}) exceed per-run cap (${this.policy.perRun.maxTokens})`;
      return result;
    }

    // Hard stop on monthly first (the bigger commitment)
    if (projectedMonthly > monthlyLimit && monthlyLimit > 0) {
      this.handleOverrun(agentId, 'monthly', monthlyTokensUsed, monthlyLimit, result);
      return result;
    }

    if (projectedDaily > dailyLimit && dailyLimit > 0) {
      this.handleOverrun(agentId, 'daily', dailyTokensUsed, dailyLimit, result);
      return result;
    }

    // Warning threshold
    const dailyPct = result.daily.pctUsed;
    const monthlyPct = result.monthly.pctUsed;
    if (dailyPct >= this.policy.warningThreshold || monthlyPct >= this.policy.warningThreshold) {
      const period = monthlyPct > dailyPct ? 'monthly' : 'daily';
      const pct = Math.max(dailyPct, monthlyPct);
      result.warning = `Budget warning: ${(pct * 100).toFixed(0)}% of ${period} limit used`;

      const lastPct = this.lastWarning.get(`${agentId}:${period}`) ?? 0;
      if (pct - lastPct >= 0.05) {
        this.lastWarning.set(`${agentId}:${period}`, pct);
        eventBus.emit('budget:warning', {
          agentId,
          period,
          percentUsed: pct,
          tokensUsed: period === 'daily' ? dailyTokensUsed : monthlyTokensUsed,
          tokensLimit: period === 'daily' ? dailyLimit : monthlyLimit,
        });
      }
    }

    return result;
  }

  private handleOverrun(
    agentId: string,
    period: 'daily' | 'monthly',
    used: number,
    limit: number,
    result: BudgetCheck,
  ): void {
    eventBus.emit('budget:exceeded', {
      agentId,
      period,
      tokensUsed: used,
      tokensLimit: limit,
      action: this.policy.action,
    });

    if (this.policy.action === 'block' || this.policy.action === 'pause') {
      result.allowed = false;
      result.reason = `${period} budget exceeded (${used}/${limit} tokens) — action: ${this.policy.action}`;
      if (this.policy.action === 'pause') {
        this.pausedAgents.add(agentId);
        result.paused = true;
      }
    } else {
      result.warning = `${period} budget exceeded but action=warn — proceeding`;
    }
  }

  /** Record actual usage after a model call */
  record(usage: UsageRecord): void {
    this.db.prepare(`
      INSERT INTO usage (agent_id, model, input_tokens, output_tokens, cost, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      usage.agentId,
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cost,
      usage.timestamp,
    );
  }

  /** Total token + cost usage for a period */
  private usageInPeriod(agentId: string, period: 'daily' | 'monthly'): { tokens: number; cost: number } {
    const cutoff = period === 'daily'
      ? Date.now() - 86_400_000
      : Date.now() - 30 * 86_400_000;

    const row = this.db.prepare(`
      SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
             COALESCE(SUM(cost), 0) AS cost
      FROM usage
      WHERE agent_id = ? AND timestamp >= ?
    `).get(agentId, cutoff) as { tokens: number; cost: number };

    return { tokens: row.tokens, cost: row.cost };
  }

  /** Manually unpause an agent (admin action) */
  resume(agentId: string): boolean {
    return this.pausedAgents.delete(agentId);
  }

  /** Get current status for display */
  status(agentId: string): {
    paused: boolean;
    daily: { tokens: number; cost: number; limit: number };
    monthly: { tokens: number; cost: number; limit: number };
  } {
    const daily = this.usageInPeriod(agentId, 'daily');
    const monthly = this.usageInPeriod(agentId, 'monthly');
    return {
      paused: this.pausedAgents.has(agentId),
      daily: { ...daily, limit: this.policy.daily.tokens },
      monthly: { ...monthly, limit: this.policy.monthly.tokens },
    };
  }

  close(): void {
    this.db.close();
  }
}
