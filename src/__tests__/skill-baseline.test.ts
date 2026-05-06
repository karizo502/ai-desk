import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillTraceStore } from '../memory/skill-trace-store.js';
import { SkillBaselineFinder } from '../skills/skill-baseline.js';

let tmpDir: string;
let store: SkillTraceStore;
let finder: SkillBaselineFinder;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-baseline-'));
  store = new SkillTraceStore(tmpDir);
  finder = new SkillBaselineFinder(store, 2);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedSession(id: string, agentId: string, skillsUsed: string[], tokens: number, content = 'refactor auth module') {
  store.initSession(id, agentId, skillsUsed);
  store.recordTurn({ sessionId: id, idx: 0, role: 'user', content });
  store.finalizeSession(id, 'success', tokens);
}

describe('SkillBaselineFinder — baseline found', () => {
  it('returns average tokens of sessions without the skill', async () => {
    // Two baseline sessions (no auth-skill) with 500 and 700 tokens
    seedSession('base-1', 'agent-a', [], 500, 'refactor authentication');
    seedSession('base-2', 'agent-a', [], 700, 'refactor authentication');

    // Current session (with auth-skill)
    seedSession('curr-1', 'agent-a', ['auth-skill'], 400, 'refactor authentication');

    const result = await finder.findBaseline('agent-a', 'curr-1', 'auth-skill');
    expect(result).not.toBeNull();
    expect(result!.sampleCount).toBe(2);
    expect(result!.baselineTokens).toBe(600); // (500+700)/2
  });

  it('computes positive tokenDelta when skill uses more tokens', async () => {
    seedSession('base-3', 'agent-a', [], 300, 'database query optimization');
    seedSession('base-4', 'agent-a', [], 300, 'database query optimization');
    seedSession('curr-2', 'agent-a', ['sql-skill'], 500, 'database query optimization');

    const delta = await finder.computeTokenDelta('agent-a', 'curr-2', 'sql-skill', 500);
    expect(delta).toBe(200); // 500 - 300
  });

  it('computes negative tokenDelta when skill saves tokens', async () => {
    seedSession('base-5', 'agent-a', [], 800, 'test coverage improvement');
    seedSession('base-6', 'agent-a', [], 800, 'test coverage improvement');
    seedSession('curr-3', 'agent-a', ['test-skill'], 500, 'test coverage improvement');

    const delta = await finder.computeTokenDelta('agent-a', 'curr-3', 'test-skill', 500);
    expect(delta).toBe(-300); // 500 - 800
  });
});

describe('SkillBaselineFinder — no baseline', () => {
  it('returns null when fewer than minSamples found', async () => {
    // Only 1 baseline session (minSamples=2)
    seedSession('only-one', 'agent-a', [], 600, 'deploy pipeline setup');
    seedSession('curr-x', 'agent-a', ['deploy-skill'], 400, 'deploy pipeline setup');

    const result = await finder.findBaseline('agent-a', 'curr-x', 'deploy-skill');
    expect(result).toBeNull();
  });

  it('returns null when all similar sessions used the skill', async () => {
    seedSession('s1', 'agent-a', ['my-skill'], 500, 'code review automation');
    seedSession('s2', 'agent-a', ['my-skill'], 600, 'code review automation');
    seedSession('curr', 'agent-a', ['my-skill'], 400, 'code review automation');

    const result = await finder.findBaseline('agent-a', 'curr', 'my-skill');
    expect(result).toBeNull();
  });

  it('returns null when agents are different', async () => {
    seedSession('other-1', 'agent-b', [], 500, 'refactor code');
    seedSession('other-2', 'agent-b', [], 600, 'refactor code');
    seedSession('curr-a', 'agent-a', ['skill-x'], 400, 'refactor code');

    // agent-a has no baseline sessions (they belong to agent-b)
    const result = await finder.findBaseline('agent-a', 'curr-a', 'skill-x');
    expect(result).toBeNull();
  });
});
