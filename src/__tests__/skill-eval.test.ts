import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillEvaluator, type GoldenTask } from '../skills/skill-eval.js';
import type { SkillDefinition } from '../skills/skill.js';
import type { ModelRouter } from '../models/model-router.js';

function makeSkill(overrides: Partial<SkillDefinition> & { name: string }): SkillDefinition {
  return {
    version: '1.0.0',
    description: `Skill ${overrides.name}`,
    provenance: 'generated',
    revision: 1,
    sourceSessionId: `sess-${overrides.name}`,
    createdAt: Date.now(),
    systemPromptAddition: `Instructions for ${overrides.name}.`,
    ...overrides,
  };
}

function makePassingRouter(): ModelRouter {
  return {
    call: vi.fn().mockResolvedValue({
      content: '{"passed":true,"score":0.9,"reasoning":"Skill guides toward expected outcome."}',
    }),
    pickModel: vi.fn().mockReturnValue('anthropic/claude-haiku-4-5'),
  } as unknown as ModelRouter;
}

function makeFailingRouter(): ModelRouter {
  return {
    call: vi.fn().mockResolvedValue({
      content: '{"passed":false,"score":0.2,"reasoning":"Skill does not address the task."}',
    }),
    pickModel: vi.fn().mockReturnValue('anthropic/claude-haiku-4-5'),
  } as unknown as ModelRouter;
}

function seedGoldenTask(dir: string, task: GoldenTask): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${task.id}.eval.json`), JSON.stringify(task), 'utf-8');
}

let tmpDir: string;
let registry: SkillRegistry;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-eval-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function registerAndEnable(def: SkillDefinition): void {
  registry.registerGenerated(def, join(tmpDir, `${def.name}.skill.json`));
  registry.approve(def.name);
}

describe('SkillEvaluator — loadGoldenTasks()', () => {
  it('loads all *.eval.json files from a directory', () => {
    const goldenDir = join(tmpDir, 'golden');
    seedGoldenTask(goldenDir, {
      id: 'task-1',
      description: 'Test task',
      prompt: 'Do something',
      expectedOutcome: 'Something good happens',
      tags: ['test'],
    });
    seedGoldenTask(goldenDir, {
      id: 'task-2',
      description: 'Another task',
      prompt: 'Do something else',
      expectedOutcome: 'Something else happens',
      tags: ['test'],
    });

    const evaluator = new SkillEvaluator({
      registry,
      router: makePassingRouter(),
      goldenDir,
    });

    const tasks = evaluator.loadGoldenTasks(goldenDir);
    expect(tasks).toHaveLength(2);
    expect(tasks.map(t => t.id)).toContain('task-1');
    expect(tasks.map(t => t.id)).toContain('task-2');
  });

  it('filters tasks by tag', () => {
    const goldenDir = join(tmpDir, 'golden-tags');
    seedGoldenTask(goldenDir, {
      id: 'tagged',
      description: 'Tagged',
      prompt: 'p',
      expectedOutcome: 'e',
      tags: ['security'],
    });
    seedGoldenTask(goldenDir, {
      id: 'untagged',
      description: 'Not security',
      prompt: 'p',
      expectedOutcome: 'e',
      tags: ['data'],
    });

    const evaluator = new SkillEvaluator({ registry, router: makePassingRouter(), goldenDir });
    const tasks = evaluator.loadGoldenTasks(goldenDir, ['security']);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('tagged');
  });

  it('returns empty array when directory does not exist', () => {
    const evaluator = new SkillEvaluator({
      registry,
      router: makePassingRouter(),
      goldenDir: join(tmpDir, 'nonexistent'),
    });
    expect(evaluator.loadGoldenTasks()).toHaveLength(0);
  });
});

describe('SkillEvaluator — evalSkill()', () => {
  it('returns score=1 when LLM judges all tasks pass', async () => {
    const goldenDir = join(tmpDir, 'golden-pass');
    seedGoldenTask(goldenDir, {
      id: 'pass-task',
      description: 'Should pass',
      prompt: 'Review code for issues',
      expectedOutcome: 'Issues found and explained',
    });

    registerAndEnable(makeSkill({
      name: 'review-skill',
      systemPromptAddition: 'Always do thorough reviews.',
    }));

    const evaluator = new SkillEvaluator({ registry, router: makePassingRouter(), goldenDir });
    const report = await evaluator.evalSkill('review-skill');

    expect(report.skillName).toBe('review-skill');
    expect(report.totalTasks).toBe(1);
    expect(report.passed).toBe(1);
    expect(report.score).toBe(1.0);
  });

  it('returns score=0 when LLM judges all tasks fail', async () => {
    const goldenDir = join(tmpDir, 'golden-fail');
    seedGoldenTask(goldenDir, {
      id: 'fail-task',
      description: 'Should fail',
      prompt: 'Do something',
      expectedOutcome: 'Specific outcome',
    });

    registerAndEnable(makeSkill({
      name: 'wrong-skill',
      systemPromptAddition: 'Unrelated instructions.',
    }));

    const evaluator = new SkillEvaluator({ registry, router: makeFailingRouter(), goldenDir });
    const report = await evaluator.evalSkill('wrong-skill');

    expect(report.passed).toBe(0);
    expect(report.score).toBe(0);
  });

  it('filters evals by skill name when task.skill is set', async () => {
    const goldenDir = join(tmpDir, 'golden-filtered');
    seedGoldenTask(goldenDir, {
      id: 'for-skill-a',
      description: 'Only for skill-a',
      prompt: 'p',
      expectedOutcome: 'e',
      skill: 'skill-a',
    });
    seedGoldenTask(goldenDir, {
      id: 'generic',
      description: 'For all skills',
      prompt: 'p2',
      expectedOutcome: 'e2',
    });

    registerAndEnable(makeSkill({ name: 'skill-a' }));

    const evaluator = new SkillEvaluator({ registry, router: makePassingRouter(), goldenDir });
    const report = await evaluator.evalSkill('skill-a');

    // both tasks run (the generic one + the skill-a one)
    expect(report.totalTasks).toBe(2);
  });

  it('returns empty report for unknown skill', async () => {
    const goldenDir = join(tmpDir, 'golden-empty');
    mkdirSync(goldenDir, { recursive: true });

    const evaluator = new SkillEvaluator({ registry, router: makePassingRouter(), goldenDir });
    const report = await evaluator.evalSkill('nonexistent');

    expect(report.totalTasks).toBe(0);
    expect(report.score).toBe(0);
  });
});

describe('SkillEvaluator — evalAll()', () => {
  it('evaluates all enabled skills', async () => {
    const goldenDir = join(tmpDir, 'golden-all');
    seedGoldenTask(goldenDir, {
      id: 'all-task',
      description: 'Generic task',
      prompt: 'Do something',
      expectedOutcome: 'Result',
    });

    registerAndEnable(makeSkill({ name: 'skill-1' }));
    registerAndEnable(makeSkill({ name: 'skill-2' }));

    const evaluator = new SkillEvaluator({ registry, router: makePassingRouter(), goldenDir });
    const reports = await evaluator.evalAll();

    expect(reports).toHaveLength(2);
    expect(reports.map(r => r.skillName)).toContain('skill-1');
    expect(reports.map(r => r.skillName)).toContain('skill-2');
  });
});
