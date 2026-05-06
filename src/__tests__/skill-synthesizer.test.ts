import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SkillSynthesizer } from '../skills/skill-synthesizer.js';
import { SkillTraceStore } from '../memory/skill-trace-store.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillRateLimiter } from '../skills/skill-rate-limit.js';
import type { SkillSynthesisConfig } from '../config/schema.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SYNTH_CONFIG: SkillSynthesisConfig = {
  model: 'anthropic/claude-sonnet-4-6',
  improvementModel: 'anthropic/claude-sonnet-4-6',
  scrubModel: 'anthropic/claude-haiku-4-5',
  fallbackToHaikuUnderBudget: false,
  maxPerDay: 10,
  minGapMinutes: 0,
  autoTriggerMinToolCalls: 8,
  failureRateThreshold: 0.4,
  minUsesBeforeImprovement: 30,
  ttlDays: 60,
  maxEnabledPerAgent: 15,
  maxGeneratedTotal: 50,
  deprecateAfterNegativeUses: 10,
};

const VALID_SKILL_JSON = JSON.stringify({
  name: 'test-skill',
  version: '1.0.0',
  description: 'Handles test scenarios efficiently',
  author: 'ai-desk-synthesizer',
  tags: ['testing', 'automation'],
  systemPromptAddition: 'Always write unit tests for new code.',
  toolAllowlist: ['read_file'],
  provenance: 'generated',
  revision: 1,
  sourceSessionId: 'session-test-001',
  traceHash: 'abc123def456',
  modelId: 'claude-sonnet-4-6',
  promptTemplateVersion: 'skill-synthesis.v1',
  createdAt: Date.now(),
  kind: 'positive',
  scope: 'project',
});

function makeMockRouter(responseContent: string) {
  return {
    call: vi.fn().mockResolvedValue({
      content: responseContent,
      toolCalls: [],
      stopReason: 'end_turn',
      model: 'claude-sonnet-4-6',
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, estimatedCost: 0.001 },
    }),
    pickModel: vi.fn().mockReturnValue('anthropic/claude-sonnet-4-6'),
    status: vi.fn().mockReturnValue([]),
  };
}

function makeMockBudget(allowed = true) {
  return {
    check: vi.fn().mockReturnValue({ allowed, reason: allowed ? undefined : 'Budget exceeded', warning: false, paused: false, daily: { used: 0, limit: 100, pctUsed: 0 }, monthly: { used: 0, limit: 1000, pctUsed: 0 } }),
    record: vi.fn(),
    close: vi.fn(),
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let tmpDir: string;
let traceStore: SkillTraceStore;
let registry: SkillRegistry;
let rateLimiter: SkillRateLimiter;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-synth-'));
  traceStore = new SkillTraceStore(tmpDir);
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  rateLimiter = new SkillRateLimiter(tmpDir, { maxPerDay: 10, minGapMinutes: 0 });

  // Seed a session trace
  traceStore.initSession('session-test-001', 'agent-a', ['read_file', 'glob']);
  traceStore.recordTurn({ sessionId: 'session-test-001', idx: 0, role: 'user', content: 'refactor auth module' });
  traceStore.recordTurn({ sessionId: 'session-test-001', idx: 1, role: 'tool', content: 'file content', toolName: 'read_file' });
  traceStore.finalizeSession('session-test-001', 'success', 500);
});

afterEach(() => {
  traceStore.close();
  rateLimiter.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSynthesizer(routerResponse: string, budgetAllowed = true) {
  return new SkillSynthesizer({
    traceStore,
    registry,
    router: makeMockRouter(routerResponse) as any,
    budget: makeMockBudget(budgetAllowed) as any,
    rateLimiter,
    config: SYNTH_CONFIG,
    outputDir: join(tmpDir, 'generated'),
    promptTemplatePath: join(tmpdir(), 'nonexistent-uses-fallback.md'),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillSynthesizer — happy path', () => {
  it('synthesizes and writes a valid skill', async () => {
    const synth = makeSynthesizer(VALID_SKILL_JSON);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.errors).toBeUndefined();
    expect(result.dryRun).toBe(false);
    expect(result.skill?.name).toBe('test-skill');
    expect(result.filePath).toBeDefined();
    expect(existsSync(result.filePath!)).toBe(true);
  });

  it('registers the skill as pending approval', async () => {
    const synth = makeSynthesizer(VALID_SKILL_JSON);
    await synth.synthesize(['session-test-001'], { agentId: 'test' });

    const pending = registry.listPendingApproval();
    expect(pending.map(s => s.definition.name)).toContain('test-skill');
    expect(registry.get('test-skill')?.state.enabled).toBe(false);
  });

  it('dry-run: returns skill but does not write to disk', async () => {
    const synth = makeSynthesizer(VALID_SKILL_JSON);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test', dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.skill?.name).toBe('test-skill');
    expect(result.filePath).toBeUndefined();
    expect(registry.listPendingApproval()).toHaveLength(0);
  });
});

describe('SkillSynthesizer — security guards', () => {
  it('rejects skill with mcpServer in output', async () => {
    const withMcp = JSON.stringify({
      ...JSON.parse(VALID_SKILL_JSON),
      mcpServer: { command: 'evil', args: [], capabilities: [], sandbox: false },
    });
    const synth = makeSynthesizer(withMcp);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.errors).toBeDefined();
    expect(result.errors!.join(' ')).toContain('mcpServer');
    expect(result.skill).toBeUndefined();
  });

  it('rejects skill with toolAllowlist outside session allowlist', async () => {
    const badTools = JSON.stringify({
      ...JSON.parse(VALID_SKILL_JSON),
      toolAllowlist: ['read_file', 'execute_shell'], // execute_shell not in session
    });
    const synth = makeSynthesizer(badTools);
    const result = await synth.synthesize(['session-test-001'], {
      agentId: 'test',
      sessionAllowedTools: ['read_file', 'glob'],
    });

    expect(result.errors).toBeDefined();
    expect(result.errors!.join(' ')).toContain('execute_shell');
  });

  it('returns errors when LLM output is not valid JSON', async () => {
    const synth = makeSynthesizer('Not a JSON response, just some text');
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.errors).toBeDefined();
  });

  it('blocks when budget is exceeded', async () => {
    const synth = makeSynthesizer(VALID_SKILL_JSON, false);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.budgetBlocked).toBe(true);
    expect(result.skill).toBeUndefined();
  });
});

describe('SkillSynthesizer — dedup detection', () => {
  it('detects a duplicate skill with high tag/description similarity', async () => {
    // Register a very similar existing skill first
    registry.registerGenerated({
      name: 'test-skill-existing',
      version: '1.0.0',
      description: 'Handles test scenarios efficiently', // same description
      tags: ['testing', 'automation'],                   // same tags
      provenance: 'generated',
      revision: 1,
      sourceSessionId: 'session-old',
      createdAt: Date.now(),
    }, join(tmpDir, 'test-skill-existing.skill.json'));
    registry.approve('test-skill-existing');

    const synth = makeSynthesizer(VALID_SKILL_JSON);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOf).toBe('test-skill-existing');
  });

  it('does not flag dissimilar skills as duplicates', async () => {
    registry.registerGenerated({
      name: 'completely-different',
      version: '1.0.0',
      description: 'Manages database migrations and schema changes',
      tags: ['database', 'migration'],
      provenance: 'generated',
      revision: 1,
      sourceSessionId: 'session-db',
      createdAt: Date.now(),
    }, join(tmpDir, 'completely-different.skill.json'));

    const synth = makeSynthesizer(VALID_SKILL_JSON);
    const result = await synth.synthesize(['session-test-001'], { agentId: 'test' });

    expect(result.isDuplicate).toBe(false);
  });
});

describe('SkillSynthesizer — missing session', () => {
  it('returns error for nonexistent session ID', async () => {
    const synth = makeSynthesizer(VALID_SKILL_JSON);
    const result = await synth.synthesize(['nonexistent-session-id'], { agentId: 'test' });

    expect(result.errors).toBeDefined();
  });
});
