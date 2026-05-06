import { describe, it, expect, vi } from 'vitest';
import { SkillSandbox } from '../skills/skill-sandbox.js';
import type { TracedTurn } from '../memory/skill-trace-store.js';

function makeTurns(): TracedTurn[] {
  return [
    { sessionId: 's1', idx: 0, role: 'user',      content: 'refactor the authentication module' },
    { sessionId: 's1', idx: 1, role: 'tool',       content: 'file read', toolName: 'read_file', toolOutput: 'export function login() {}' },
    { sessionId: 's1', idx: 2, role: 'assistant',  content: 'I have read the auth module and will refactor it.' },
    { sessionId: 's1', idx: 3, role: 'tool',       content: 'file written', toolName: 'write_file', toolOutput: 'ok' },
  ];
}

const GOOD_RESPONSE = JSON.stringify({
  estimatedTokenDelta: -150,
  estimatedToolCallDelta: -1,
  confidence: 0.8,
  assessment: 'The skill would have reduced redundant file reads.',
});

function makeRouter(content: string, shouldThrow = false) {
  return {
    call: shouldThrow
      ? vi.fn().mockRejectedValue(new Error('provider offline'))
      : vi.fn().mockResolvedValue({
          content,
          toolCalls: [],
          stopReason: 'end_turn',
          model: 'claude-haiku',
          usage: { inputTokens: 50, outputTokens: 80, totalTokens: 130, estimatedCost: 0 },
        }),
    pickModel: vi.fn().mockReturnValue('anthropic/claude-haiku-4-5'),
  };
}

describe('SkillSandbox — happy path', () => {
  it('returns a valid SandboxReplayResult', async () => {
    const router = makeRouter(GOOD_RESPONSE);
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'auth-refactor', description: 'Refactors auth modules', systemPromptAddition: 'Always use dependency injection for auth services.' },
      makeTurns(),
    );

    expect(result.ok).toBe(true);
    expect(result.estimatedTokenDelta).toBe(-150);
    expect(result.estimatedToolCallDelta).toBe(-1);
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.assessment).toContain('redundant');
  });

  it('strips markdown fences from judge response', async () => {
    const fenced = '```json\n' + GOOD_RESPONSE + '\n```';
    const router = makeRouter(fenced);
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'Always test.' },
      makeTurns(),
    );
    expect(result.ok).toBe(true);
    expect(result.estimatedTokenDelta).toBe(-150);
  });

  it('passes preferredModel from opts to router', async () => {
    const router = makeRouter(GOOD_RESPONSE);
    const sandbox = new SkillSandbox(router as any);
    await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'X' },
      makeTurns(),
      { model: 'anthropic/claude-sonnet-4-6' },
    );
    expect(router.call).toHaveBeenCalledWith(
      expect.objectContaining({ preferredModel: 'anthropic/claude-sonnet-4-6' }),
    );
  });
});

describe('SkillSandbox — error handling', () => {
  it('returns ok=false when trace is empty', async () => {
    const router = makeRouter(GOOD_RESPONSE);
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'X' },
      [],
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('returns ok=false when router throws', async () => {
    const router = makeRouter('', true);
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'X' },
      makeTurns(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/router error/i);
  });

  it('returns ok=false when response is not valid JSON', async () => {
    const router = makeRouter('This is not JSON at all, just prose.');
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'X' },
      makeTurns(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/parse/i);
  });

  it('clamps confidence to [0, 1]', async () => {
    const badConf = JSON.stringify({
      estimatedTokenDelta: 0,
      estimatedToolCallDelta: 0,
      confidence: 1.5,  // out of range
      assessment: 'test',
    });
    const router = makeRouter(badConf);
    const sandbox = new SkillSandbox(router as any);
    const result = await sandbox.replay(
      { name: 'test', description: 'test', systemPromptAddition: 'X' },
      makeTurns(),
    );
    expect(result.ok).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
