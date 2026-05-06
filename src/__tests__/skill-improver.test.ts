import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillImprover } from '../skills/skill-improver.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillTraceStore } from '../memory/skill-trace-store.js';
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
  minUsesBeforeImprovement: 5,
  ttlDays: 60,
  maxEnabledPerAgent: 15,
  maxGeneratedTotal: 50,
  deprecateAfterNegativeUses: 10,
};

const BASE_SKILL: SkillDefinition = {
  name: 'test-skill',
  version: '1.0.0',
  description: 'Test skill for improvement',
  provenance: 'generated',
  revision: 1,
  sourceSessionId: 'sess-001',
  createdAt: Date.now(),
  systemPromptAddition: 'Always validate inputs before processing.',
  toolAllowlist: ['read_file'],
};

const REVISED_SKILL_JSON = JSON.stringify({
  ...BASE_SKILL,
  version: '1.1.0',
  revision: 2,
  parentSkill: 'test-skill',
  description: 'Improved test skill',
  systemPromptAddition: 'Always validate inputs. Check for null values explicitly.',
  promptTemplateVersion: 'skill-improve.v1',
  createdAt: Date.now(),
});

function makeRouter(content: string, shouldThrow = false) {
  return {
    call: shouldThrow
      ? vi.fn().mockRejectedValue(new Error('LLM offline'))
      : vi.fn().mockResolvedValue({
          content,
          toolCalls: [],
          stopReason: 'end_turn',
          model: 'claude-sonnet',
          usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, estimatedCost: 0 },
        }),
    pickModel: vi.fn().mockReturnValue('anthropic/claude-sonnet-4-6'),
  };
}

function makeBudget(allowed = true) {
  return {
    check: vi.fn().mockReturnValue({ allowed, reason: allowed ? undefined : 'Over budget', warning: false, paused: false, daily: { used: 0, limit: 100, pctUsed: 0 }, monthly: { used: 0, limit: 1000, pctUsed: 0 } }),
    record: vi.fn(),
    close: vi.fn(),
  };
}

let tmpDir: string;
let registry: SkillRegistry;
let traceStore: SkillTraceStore;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-improver-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  traceStore = new SkillTraceStore(tmpDir);
});

afterEach(() => {
  traceStore.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedWithMetrics(uses: number, failures: number) {
  registry.registerGenerated(BASE_SKILL, join(tmpDir, 'test-skill.skill.json'));
  registry.approve('test-skill');
  // Simulate usage by calling recordUsage
  for (let i = 0; i < uses - failures; i++) registry.recordUsage('test-skill', true);
  for (let i = 0; i < failures; i++) registry.recordUsage('test-skill', false);
}

function seedFailureTrace() {
  traceStore.initSession('sess-fail', 'agent-a', ['test-skill']);
  traceStore.recordTurn({ sessionId: 'sess-fail', idx: 0, role: 'user', content: 'process the data' });
  traceStore.finalizeSession('sess-fail', 'failure', 300);
}

describe('SkillImprover — findCandidates', () => {
  it('returns skills above threshold', () => {
    seedWithMetrics(10, 6); // 60% failure rate > 40% threshold
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter('') as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const candidates = improver.findCandidates();
    expect(candidates.map(c => c.name)).toContain('test-skill');
  });

  it('excludes skills below threshold', () => {
    seedWithMetrics(10, 2); // 20% failure rate < 40% threshold
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter('') as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const candidates = improver.findCandidates();
    expect(candidates.map(c => c.name)).not.toContain('test-skill');
  });

  it('excludes skills with too few uses', () => {
    seedWithMetrics(3, 3); // 100% failure but only 3 uses < minUsesBeforeImprovement=5
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter('') as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const candidates = improver.findCandidates();
    expect(candidates.map(c => c.name)).not.toContain('test-skill');
  });
});

describe('SkillImprover — improve', () => {
  it('returns skipped when failure rate is below threshold', async () => {
    seedWithMetrics(10, 2); // 20% failure rate
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter(REVISED_SKILL_JSON) as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const result = await improver.improve('test-skill');
    expect(result.skipped).toBeDefined();
    expect(result.revised).toBeUndefined();
  });

  it('returns error when skill not found', async () => {
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter(REVISED_SKILL_JSON) as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const result = await improver.improve('nonexistent-skill');
    expect(result.errors).toBeDefined();
  });

  it('returns error when budget is exceeded', async () => {
    seedWithMetrics(10, 6);
    seedFailureTrace();
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter(REVISED_SKILL_JSON) as any,
      budget: makeBudget(false) as any, // over budget
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
    });
    const result = await improver.improve('test-skill');
    expect(result.errors).toBeDefined();
    expect(result.errors!.join(' ')).toMatch(/budget/i);
  });

  it('dry-run returns revised skill without writing files', async () => {
    seedWithMetrics(10, 6);
    seedFailureTrace();
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter(REVISED_SKILL_JSON) as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
      promptTemplatePath: join(tmpDir, 'nonexistent.md'),
    });
    const result = await improver.improve('test-skill', { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.revised?.name).toBe('test-skill');
    expect(result.filePath).toBeUndefined();
  });

  it('returns error when LLM response is not valid JSON', async () => {
    seedWithMetrics(10, 6);
    seedFailureTrace();
    const improver = new SkillImprover({
      traceStore, registry,
      router: makeRouter('Not valid JSON at all') as any,
      budget: makeBudget() as any,
      config: CONFIG,
      outputDir: join(tmpDir, 'generated'),
      promptTemplatePath: join(tmpDir, 'nonexistent.md'),
    });
    const result = await improver.improve('test-skill');
    expect(result.errors).toBeDefined();
  });
});
