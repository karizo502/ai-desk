import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResponseCache } from '../cache/response-cache.js';

const TEST_KEY = 'test-master-key-abc123';

const makeCall = (model: string, prompt: string) => ({
  model,
  messages: [{ role: 'user' as const, content: prompt }],
  systemPrompt: 'You are helpful.',
  maxTokens: 1000,
  temperature: 0.7,
});

const makeResult = (content: string) => ({
  content,
  toolCalls: [],
  stopReason: 'end_turn' as const,
  model: 'claude-sonnet-4-6-20251001',
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    estimatedCost: 0.001,
  },
});

describe('ResponseCache', () => {
  let tmpDir: string;
  let cache: ResponseCache;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-cache-test-'));
    cache = new ResponseCache(tmpDir, TEST_KEY, { enabled: true, backend: 'sqlite', ttlSeconds: 60 });
  });

  afterEach(() => {
    cache.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null on a cache miss', () => {
    const result = cache.get(makeCall('model-a', 'hello'));
    expect(result).toBeNull();
  });

  it('stores and retrieves a cache entry', () => {
    const call = makeCall('model-a', 'what is 2+2?');
    const result = makeResult('4');
    cache.set(call, result);
    const hit = cache.get(call);
    expect(hit).not.toBeNull();
    expect(hit?.content).toBe('4');
  });

  it('different prompts produce different cache entries', () => {
    cache.set(makeCall('m', 'prompt A'), makeResult('answer A'));
    cache.set(makeCall('m', 'prompt B'), makeResult('answer B'));
    expect(cache.get(makeCall('m', 'prompt A'))?.content).toBe('answer A');
    expect(cache.get(makeCall('m', 'prompt B'))?.content).toBe('answer B');
  });

  it('different models produce different cache entries', () => {
    cache.set(makeCall('model-x', 'hello'), makeResult('from x'));
    cache.set(makeCall('model-y', 'hello'), makeResult('from y'));
    expect(cache.get(makeCall('model-x', 'hello'))?.content).toBe('from x');
    expect(cache.get(makeCall('model-y', 'hello'))?.content).toBe('from y');
  });

  it('purgeExpired removes no entries when TTL has not elapsed', () => {
    cache.set(makeCall('m', 'q'), makeResult('a'));
    const removed = cache.purgeExpired();
    expect(removed).toBe(0);
  });

  it('is a no-op when disabled', () => {
    const disabledCache = new ResponseCache(tmpDir, TEST_KEY, {
      enabled: false,
      backend: 'none',
      ttlSeconds: 60,
    });
    disabledCache.set(makeCall('m', 'test'), makeResult('result'));
    expect(disabledCache.get(makeCall('m', 'test'))).toBeNull();
    disabledCache.close();
  });

  it('overwrites an existing entry with the same key', () => {
    const call = makeCall('m', 'same prompt');
    cache.set(call, makeResult('first'));
    cache.set(call, makeResult('second'));
    expect(cache.get(call)?.content).toBe('second');
  });
});
