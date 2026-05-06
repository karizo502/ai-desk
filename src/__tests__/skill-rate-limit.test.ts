import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRateLimiter } from '../skills/skill-rate-limit.js';

let tmpDir: string;
let limiter: SkillRateLimiter;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-rl-'));
  limiter = new SkillRateLimiter(tmpDir, { maxPerDay: 3, minGapMinutes: 1 });
});

afterEach(() => {
  limiter.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SkillRateLimiter', () => {
  it('allows first synthesis', () => {
    const result = limiter.checkAndRecord();
    expect(result.allowed).toBe(true);
    expect(result.usedToday).toBe(1);
  });

  it('blocks when daily limit is reached', () => {
    // Use no-gap limiter so we can hit the daily limit quickly
    const noGapLimiter = new SkillRateLimiter(tmpDir, { maxPerDay: 3, minGapMinutes: 0 });
    noGapLimiter.checkAndRecord('daily-test'); // 1
    noGapLimiter.checkAndRecord('daily-test'); // 2
    noGapLimiter.checkAndRecord('daily-test'); // 3
    const result = noGapLimiter.checkAndRecord('daily-test'); // 4 — blocked by daily limit
    noGapLimiter.close();
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/limit/i);
    expect(result.resetAt).toBeDefined();
  });

  it('blocks when min gap has not elapsed', () => {
    limiter.checkAndRecord(); // allowed
    // Immediately try again — gap is 1 minute, not elapsed
    const result = limiter.checkAndRecord();
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/wait/i);
  });

  it('allows after min gap elapses', async () => {
    // Use a limiter with 0-minute gap for this test
    const fastLimiter = new SkillRateLimiter(tmpDir, { maxPerDay: 10, minGapMinutes: 0 });
    fastLimiter.checkAndRecord('agent-fast');
    const result = fastLimiter.checkAndRecord('agent-fast');
    expect(result.allowed).toBe(true);
    fastLimiter.close();
  });

  it('tracks usage per agent independently', () => {
    limiter.checkAndRecord('agent-a');
    limiter.checkAndRecord('agent-a');
    limiter.checkAndRecord('agent-a');
    const blocked = limiter.checkAndRecord('agent-a');
    expect(blocked.allowed).toBe(false);

    // agent-b is independent
    const agentB = limiter.checkAndRecord('agent-b');
    expect(agentB.allowed).toBe(true);
  });

  it('reports usedToday correctly', () => {
    expect(limiter.usedToday()).toBe(0);
    limiter.checkAndRecord();
    expect(limiter.usedToday()).toBe(1);
  });

  it('does not record when rate-limited', () => {
    const noGapLimiter = new SkillRateLimiter(tmpDir, { maxPerDay: 3, minGapMinutes: 0 });
    noGapLimiter.checkAndRecord('no-record-test'); // 1
    noGapLimiter.checkAndRecord('no-record-test'); // 2
    noGapLimiter.checkAndRecord('no-record-test'); // 3
    noGapLimiter.checkAndRecord('no-record-test'); // 4 — blocked, should NOT be recorded
    expect(noGapLimiter.usedToday('no-record-test')).toBe(3); // still 3, not 4
    noGapLimiter.close();
  });
});
