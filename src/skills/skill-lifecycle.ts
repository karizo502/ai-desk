/**
 * AI_DESK — Skill Lifecycle Manager
 *
 * Runs three auto-deprecation checks and enforces skill count limits:
 *
 *   1. Negative-ROI deprecation — archive skills where avgTokensSaved < 0
 *      for `deprecateAfterNegativeUses` consecutive uses
 *
 *   2. TTL expiry — archive skills not used within `ttlDays` days
 *
 *   3. LRU pruning — when enabled skills per agent exceed `maxEnabledPerAgent`,
 *      disable the least-recently-used skill (does NOT archive, just disables)
 *
 * All mutations emit audit events and use registry.archive() / registry.disable().
 */
import type { SkillRegistry } from './skill-registry.js';
import type { SkillSynthesisConfig } from '../config/schema.js';
import type { SkillMetrics } from './skill.js';
import { eventBus } from '../shared/events.js';

export interface LifecycleReport {
  archivedForNegativeRoi: string[];
  archivedForTtl: string[];
  disabledForLruPrune: string[];
  checkedAt: number;
}

export class SkillLifecycleManager {
  private registry: SkillRegistry;
  private config: SkillSynthesisConfig;

  constructor(registry: SkillRegistry, config: SkillSynthesisConfig) {
    this.registry = registry;
    this.config = config;
  }

  /** Run all lifecycle checks. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runChecks(_agentId?: string): LifecycleReport {
    const report: LifecycleReport = {
      archivedForNegativeRoi: [],
      archivedForTtl: [],
      disabledForLruPrune: [],
      checkedAt: Date.now(),
    };

    const allSkills = this.registry.list();

    for (const loaded of allSkills) {
      if (!loaded.state.enabled) continue;
      const { definition, state } = loaded;

      // 1. Negative-ROI check
      if (this.isNegativeRoi(state.metrics, this.config.deprecateAfterNegativeUses)) {
        this.registry.archive(definition.name, { connectionId: 'lifecycle-manager' });
        report.archivedForNegativeRoi.push(definition.name);
        eventBus.emit('skills:archived', {
          name: definition.name,
          reason: 'negative-roi',
          connectionId: 'lifecycle-manager',
        });
        continue;
      }

      // 2. TTL check (only for generated skills)
      if (definition.provenance === 'generated') {
        const ttl = (definition.ttlDays ?? this.config.ttlDays) * 24 * 60 * 60 * 1000;
        const lastUsed = state.metrics?.lastUsedAt ?? definition.createdAt ?? 0;
        if (lastUsed > 0 && Date.now() - lastUsed > ttl) {
          this.registry.archive(definition.name, { connectionId: 'lifecycle-manager' });
          report.archivedForTtl.push(definition.name);
          eventBus.emit('skills:archived', {
            name: definition.name,
            reason: 'ttl-expired',
            connectionId: 'lifecycle-manager',
          });
        }
      }
    }

    // 3. LRU prune — global check (agentId parameter reserved for multi-agent scope in Phase 5)
    const enabledAfterPrune = this.registry.list().filter(s => s.state.enabled);
    const max = this.config.maxEnabledPerAgent;

    if (enabledAfterPrune.length > max) {
      const sorted = [...enabledAfterPrune].sort((a, b) => {
        const aLast = a.state.metrics?.lastUsedAt ?? 0;
        const bLast = b.state.metrics?.lastUsedAt ?? 0;
        return aLast - bLast; // oldest first
      });

      const toPrune = sorted.slice(0, enabledAfterPrune.length - max);
      for (const skill of toPrune) {
        this.registry.disable(skill.definition.name, { connectionId: 'lifecycle-manager' });
        report.disabledForLruPrune.push(skill.definition.name);
        eventBus.emit('skills:disabled', {
          name: skill.definition.name,
          reason: 'lru-prune',
          connectionId: 'lifecycle-manager',
        });
      }
    }

    return report;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private isNegativeRoi(
    metrics: SkillMetrics | undefined,
    deprecateAfter: number,
  ): boolean {
    if (!metrics) return false;
    if (metrics.uses < deprecateAfter) return false;
    if (metrics.avgTokensSaved === undefined) return false;

    // avgTokensSaved < 0 means skill is consuming more tokens — bad ROI
    // We check this at the rolling-average level (EMA already smoothed)
    if (metrics.avgTokensSaved >= 0) return false;

    // Only deprecate if we have enough uses to be confident
    return metrics.uses >= deprecateAfter;
  }
}
