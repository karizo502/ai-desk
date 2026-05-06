import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillAutoTrigger } from '../skills/skill-auto-trigger.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillTraceStore } from '../memory/skill-trace-store.js';
import type { SkillSynthesisConfig } from '../config/schema.js';
import type { SkillDefinition } from '../skills/skill.js';

const CONFIG: SkillSynthesisConfig = {
  model: 'anthropic/claude-sonnet-4-6',
  improvementModel: 'anthropic/claude-sonnet-4-6',
  scrubModel: 'anthropic/claude-haiku-4-5',
  fallbackToHaikuUnderBudget: false,
  maxPerDay: 10,
  minGapMinutes: 0,
  autoTriggerMinToolCalls: 5,
  failureRateThreshold: 0.4,
  minUsesBeforeImprovement: 30,
  ttlDays: 60,
  maxEnabledPerAgent: 15,
  maxGeneratedTotal: 50,
  deprecateAfterNegativeUses: 10,
};

let tmpDir: string;
let registry: SkillRegistry;
let traceStore: SkillTraceStore;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-autotrigger-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  traceStore = new SkillTraceStore(tmpDir);
});

afterEach(() => {
  traceStore.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSynthesizer(synthesizeFn: () => Promise<unknown>) {
  return { synthesize: vi.fn(synthesizeFn) };
}

describe('SkillAutoTrigger — maybeEnqueue', () => {
  it('enqueues synthesis when tool calls meet threshold', async () => {
    const synthesize = vi.fn().mockResolvedValue({ isDuplicate: false, dryRun: false });
    const trigger = new SkillAutoTrigger({
      traceStore, registry,
      synthesizer: makeSynthesizer(() => synthesize()) as any,
      config: CONFIG,
    });

    // Seed a session
    traceStore.initSession('sess-1', 'agent-a', []);
    traceStore.recordTurn({ sessionId: 'sess-1', idx: 0, role: 'user', content: 'complex deployment task' });
    traceStore.finalizeSession('sess-1', 'success', 500);

    trigger.maybeEnqueue({ agentId: 'agent-a', sessionId: 'sess-1', toolCallCount: 8 });

    // Give the async fire-and-forget a tick to run
    await new Promise(r => setTimeout(r, 10));
    expect(synthesize).toHaveBeenCalledOnce();
  });

  it('does NOT enqueue when tool calls are below threshold', async () => {
    const synthesize = vi.fn().mockResolvedValue({ isDuplicate: false, dryRun: false });
    const trigger = new SkillAutoTrigger({
      traceStore, registry,
      synthesizer: makeSynthesizer(() => synthesize()) as any,
      config: CONFIG,
    });

    traceStore.initSession('sess-low', 'agent-a', []);
    traceStore.recordTurn({ sessionId: 'sess-low', idx: 0, role: 'user', content: 'simple task' });
    traceStore.finalizeSession('sess-low', 'success', 100);

    trigger.maybeEnqueue({ agentId: 'agent-a', sessionId: 'sess-low', toolCallCount: 2 });

    await new Promise(r => setTimeout(r, 10));
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when an existing enabled skill already covers the task', async () => {
    // Register an enabled skill with description matching the session content
    const coveringSkill: SkillDefinition = {
      name: 'deployment-skill',
      version: '1.0.0',
      description: 'Handles complex deployment pipeline automation tasks',
      provenance: 'generated',
      revision: 1,
      sourceSessionId: 'old-sess',
      createdAt: Date.now(),
      systemPromptAddition: 'Always verify deployment pipeline before pushing.',
    };
    registry.registerGenerated(coveringSkill, join(tmpDir, 'deployment-skill.skill.json'));
    registry.approve('deployment-skill');

    const synthesize = vi.fn().mockResolvedValue({ isDuplicate: false, dryRun: false });
    const trigger = new SkillAutoTrigger({
      traceStore, registry,
      synthesizer: makeSynthesizer(() => synthesize()) as any,
      config: CONFIG,
    });

    traceStore.initSession('sess-covered', 'agent-a', ['deployment-skill']);
    traceStore.recordTurn({ sessionId: 'sess-covered', idx: 0, role: 'user', content: 'complex deployment pipeline automation' });
    traceStore.finalizeSession('sess-covered', 'success', 400);

    trigger.maybeEnqueue({ agentId: 'agent-a', sessionId: 'sess-covered', toolCallCount: 10 });

    await new Promise(r => setTimeout(r, 10));
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('does not throw when synthesizer errors', async () => {
    const trigger = new SkillAutoTrigger({
      traceStore, registry,
      synthesizer: makeSynthesizer(() => Promise.reject(new Error('synth failure'))) as any,
      config: CONFIG,
    });

    traceStore.initSession('sess-err', 'agent-a', []);
    traceStore.recordTurn({ sessionId: 'sess-err', idx: 0, role: 'user', content: 'some complex task workflow' });
    traceStore.finalizeSession('sess-err', 'success', 500);

    // Should not throw — fire and forget
    expect(() => {
      trigger.maybeEnqueue({ agentId: 'agent-a', sessionId: 'sess-err', toolCallCount: 10 });
    }).not.toThrow();

    // Give async time to settle
    await new Promise(r => setTimeout(r, 20));
  });
});
