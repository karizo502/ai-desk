import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillLifecycleManager } from '../skills/skill-lifecycle.js';
import type { SkillDefinition } from '../skills/skill.js';
import type { SkillSynthesisConfig } from '../config/schema.js';

const CONFIG: SkillSynthesisConfig = {
  model: 'anthropic/claude-sonnet-4-6',
  improvementModel: 'anthropic/claude-sonnet-4-6',
  scrubModel: 'anthropic/claude-haiku-4-5',
  fallbackToHaikuUnderBudget: false,
  maxPerDay: 10,
  minGapMinutes: 0,
  autoTriggerMinToolCalls: 8,
  failureRateThreshold: 0.4,
  minUsesBeforeImprovement: 30,
  ttlDays: 30,
  maxEnabledPerAgent: 3,
  maxGeneratedTotal: 50,
  deprecateAfterNegativeUses: 5,
};

function generatedSkill(name: string): SkillDefinition {
  return {
    name,
    version: '1.0.0',
    description: `Skill ${name}`,
    provenance: 'generated',
    revision: 1,
    sourceSessionId: `sess-${name}`,
    createdAt: Date.now(),
    systemPromptAddition: `Do ${name} better.`,
    ttlDays: 30,
  };
}

let tmpDir: string;
let registry: SkillRegistry;
let manager: SkillLifecycleManager;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-lifecycle-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  manager = new SkillLifecycleManager(registry, CONFIG);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function registerAndApprove(name: string, overrides: Partial<SkillDefinition> = {}): void {
  const skill = { ...generatedSkill(name), ...overrides };
  registry.registerGenerated(skill, join(tmpDir, `${name}.skill.json`));
  registry.approve(name);
}

describe('SkillLifecycleManager — negative ROI deprecation', () => {
  it('archives a skill with negative avgTokensSaved after enough uses', () => {
    registerAndApprove('bad-skill');
    // Simulate enough uses to trigger deprecation
    for (let i = 0; i < CONFIG.deprecateAfterNegativeUses; i++) {
      registry.recordUsage('bad-skill', true, -50); // negative delta = costs more tokens
    }
    // Manually set avgTokensSaved to negative (EMA converges over time)
    const skill = registry.get('bad-skill')!;
    skill.state.metrics!.avgTokensSaved = -30; // force negative for test

    const report = manager.runChecks();
    expect(report.archivedForNegativeRoi).toContain('bad-skill');
    expect(registry.get('bad-skill')).toBeUndefined(); // archived = removed from registry
  });

  it('does not archive a skill with positive avgTokensSaved', () => {
    registerAndApprove('good-skill');
    for (let i = 0; i < CONFIG.deprecateAfterNegativeUses + 2; i++) {
      registry.recordUsage('good-skill', true, 50); // positive savings
    }
    const skill = registry.get('good-skill')!;
    skill.state.metrics!.avgTokensSaved = 50;

    const report = manager.runChecks();
    expect(report.archivedForNegativeRoi).not.toContain('good-skill');
  });

  it('does not archive a skill with too few uses', () => {
    registerAndApprove('new-skill');
    registry.recordUsage('new-skill', false, -100); // 1 use only
    const skill = registry.get('new-skill')!;
    skill.state.metrics!.avgTokensSaved = -100;

    const report = manager.runChecks();
    expect(report.archivedForNegativeRoi).not.toContain('new-skill');
  });
});

describe('SkillLifecycleManager — TTL expiry', () => {
  it('archives a generated skill not used within ttlDays', () => {
    const oldTimestamp = Date.now() - (CONFIG.ttlDays + 1) * 24 * 60 * 60 * 1000;
    registerAndApprove('stale-skill');
    const skill = registry.get('stale-skill')!;
    skill.state.metrics = { uses: 2, successes: 2, failures: 0, lastUsedAt: oldTimestamp };

    const report = manager.runChecks();
    expect(report.archivedForTtl).toContain('stale-skill');
    expect(registry.get('stale-skill')).toBeUndefined();
  });

  it('does not archive a recently used skill', () => {
    registerAndApprove('fresh-skill');
    registry.recordUsage('fresh-skill', true); // sets lastUsedAt = now

    const report = manager.runChecks();
    expect(report.archivedForTtl).not.toContain('fresh-skill');
  });
});

describe('SkillLifecycleManager — LRU pruning', () => {
  it('disables LRU skills when enabled count exceeds maxEnabledPerAgent', () => {
    // Enable 4 skills (maxEnabledPerAgent = 3)
    registerAndApprove('skill-a');
    registerAndApprove('skill-b');
    registerAndApprove('skill-c');
    registerAndApprove('skill-d');

    // Set lastUsedAt: skill-a is oldest
    const old = Date.now() - 1000 * 60 * 60 * 24;
    registry.get('skill-a')!.state.metrics = { uses: 5, successes: 5, failures: 0, lastUsedAt: old };
    registry.get('skill-b')!.state.metrics = { uses: 5, successes: 5, failures: 0, lastUsedAt: Date.now() - 1000 };
    registry.get('skill-c')!.state.metrics = { uses: 5, successes: 5, failures: 0, lastUsedAt: Date.now() - 500 };
    registry.get('skill-d')!.state.metrics = { uses: 5, successes: 5, failures: 0, lastUsedAt: Date.now() };

    const report = manager.runChecks();
    expect(report.disabledForLruPrune).toContain('skill-a');
    expect(report.disabledForLruPrune).toHaveLength(1);
    // skill-a should be disabled, not archived
    const lruSkill = registry.get('skill-a');
    if (lruSkill) expect(lruSkill.state.enabled).toBe(false);
  });

  it('does not prune when count is within limit', () => {
    registerAndApprove('only-1');
    registerAndApprove('only-2');

    const report = manager.runChecks();
    expect(report.disabledForLruPrune).toHaveLength(0);
  });
});

describe('SkillLifecycleManager — clean run', () => {
  it('returns empty report when no action needed', () => {
    registerAndApprove('healthy-skill');
    registry.recordUsage('healthy-skill', true, 100);

    const report = manager.runChecks();
    expect(report.archivedForNegativeRoi).toHaveLength(0);
    expect(report.archivedForTtl).toHaveLength(0);
    expect(report.disabledForLruPrune).toHaveLength(0);
  });
});
