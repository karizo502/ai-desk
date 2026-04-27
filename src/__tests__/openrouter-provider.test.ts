/**
 * AI_DESK — OpenRouter Provider Tests
 *
 * Tests message/tool conversion logic and response parsing.
 * No network calls are made — fetch is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider, OPENROUTER_PREFIX } from '../models/openrouter-provider.js';
import type { ModelMessage } from '../models/provider.js';

// ── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    text:   () => Promise.resolve(text),
  }));
}

function captureBody(): Record<string, unknown> {
  const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}

function captureHeaders(): Record<string, string> {
  const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return call[1].headers as Record<string, string>;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider({ apiKey: 'sk-or-test-key' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── availability ────────────────────────────────────────────────────────────

  it('is available when apiKey is set', () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it('is unavailable when no key', () => {
    const p = new OpenRouterProvider({ apiKey: '' });
    expect(p.isAvailable()).toBe(false);
  });

  it('reads OPENROUTER_API_KEY env var', () => {
    process.env.OPENROUTER_API_KEY = 'from-env';
    const p = new OpenRouterProvider();
    expect(p.isAvailable()).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('has openrouter as name', () => {
    expect(provider.name).toBe('openrouter');
  });

  // ── prefix stripping ────────────────────────────────────────────────────────

  it('strips openrouter/ prefix when calling API', async () => {
    mockFetch({
      id: 'gen-1',
      choices: [{ message: { content: 'hello', tool_calls: undefined }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      model: 'anthropic/claude-sonnet-4-5',
    });

    await provider.call({
      model:    'openrouter/anthropic/claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = captureBody();
    expect(body.model).toBe('anthropic/claude-sonnet-4-5');
  });

  it('passes through model without prefix unchanged', async () => {
    mockFetch({
      id: 'gen-2',
      choices: [{ message: { content: 'hi', tool_calls: undefined }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      model: 'openai/gpt-4o',
    });

    await provider.call({
      model:    'openai/gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = captureBody();
    expect(body.model).toBe('openai/gpt-4o');
  });

  // ── auth headers ────────────────────────────────────────────────────────────

  it('sends Authorization: Bearer header', async () => {
    mockFetch({
      id: 'gen-3',
      choices: [{ message: { content: 'ok', tool_calls: undefined }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      model: 'test/model',
    });

    await provider.call({ model: 'test/model', messages: [{ role: 'user', content: 'x' }] });

    const headers = captureHeaders();
    expect(headers['Authorization']).toBe('Bearer sk-or-test-key');
    expect(headers['HTTP-Referer']).toBe('https://ai-desk.local');
    expect(headers['X-Title']).toBe('AI_DESK');
  });

  // ── message conversion ──────────────────────────────────────────────────────

  it('injects systemPrompt as first system message', async () => {
    mockFetch({
      id: 'g', choices: [{ message: { content: 'y' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }, model: 'm',
    });

    await provider.call({
      model:        'test/model',
      messages:     [{ role: 'user', content: 'hello' }],
      systemPrompt: 'You are a helper.',
    });

    const body = captureBody();
    const msgs = body.messages as Array<{ role: string; content: string }>;
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('You are a helper.');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toBe('hello');
  });

  it('skips internal system messages (already handled via systemPrompt)', async () => {
    mockFetch({
      id: 'g', choices: [{ message: { content: 'y' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }, model: 'm',
    });

    const messages: ModelMessage[] = [
      { role: 'system',    content: 'system instructions' },
      { role: 'user',      content: 'question' },
      { role: 'assistant', content: 'answer' },
    ];
    await provider.call({ model: 'test/model', messages });

    const body = captureBody();
    const msgs = body.messages as Array<{ role: string }>;
    // system message should be filtered out (no systemPrompt supplied separately)
    expect(msgs.every((m) => m.role !== 'system')).toBe(true);
  });

  it('merges consecutive assistant tool-use messages into one turn', async () => {
    mockFetch({
      id: 'g', choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }, model: 'm',
    });

    const messages: ModelMessage[] = [
      { role: 'user',      content: 'run two tools' },
      { role: 'assistant', content: '', toolName: 'tool_a', toolUseId: 'id-a', toolInput: { x: 1 } },
      { role: 'assistant', content: '', toolName: 'tool_b', toolUseId: 'id-b', toolInput: { y: 2 } },
      { role: 'tool',      content: 'result_a', toolUseId: 'id-a' },
      { role: 'tool',      content: 'result_b', toolUseId: 'id-b' },
    ];
    await provider.call({ model: 'test/model', messages });

    const body = captureBody();
    const msgs = body.messages as Array<{
      role: string;
      tool_calls?: Array<{ id: string; function: { name: string } }>;
      tool_call_id?: string;
    }>;

    const assistantMsg = msgs.find(m => m.role === 'assistant');
    expect(assistantMsg?.tool_calls).toHaveLength(2);
    expect(assistantMsg?.tool_calls?.[0].id).toBe('id-a');
    expect(assistantMsg?.tool_calls?.[1].id).toBe('id-b');

    const toolMsgs = msgs.filter(m => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs[0].tool_call_id).toBe('id-a');
    expect(toolMsgs[1].tool_call_id).toBe('id-b');
  });

  // ── tool definition conversion ──────────────────────────────────────────────

  it('converts tool definitions to OpenAI function format', async () => {
    mockFetch({
      id: 'g',
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call-1', type: 'function',
            function: { name: 'read_file', arguments: '{"path":"/tmp/x"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: 'test/model',
    });

    const result = await provider.call({
      model:    'test/model',
      messages: [{ role: 'user', content: 'read /tmp/x' }],
      tools: [{
        name:        'read_file',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }],
    });

    const body = captureBody();
    const tools = body.tools as Array<{ type: string; function: { name: string; parameters: unknown } }>;
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('read_file');
    expect(body.tool_choice).toBe('auto');

    // Verify tool call in response is correctly parsed
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe('call-1');
    expect(result.toolCalls[0].name).toBe('read_file');
    expect(result.toolCalls[0].input).toEqual({ path: '/tmp/x' });
    expect(result.stopReason).toBe('tool_use');
  });

  // ── response parsing ────────────────────────────────────────────────────────

  it('returns parsed content and usage', async () => {
    mockFetch({
      id: 'gen-ok',
      choices: [{ message: { content: 'The answer is 42.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 },
      model: 'openai/gpt-4o',
    });

    const result = await provider.call({
      model:    'openrouter/openai/gpt-4o',
      messages: [{ role: 'user', content: 'What is the answer?' }],
    });

    expect(result.content).toBe('The answer is 42.');
    expect(result.usage.inputTokens).toBe(8);
    expect(result.usage.outputTokens).toBe(6);
    expect(result.usage.totalTokens).toBe(14);
    expect(result.stopReason).toBe('end_turn');
    expect(result.model).toBe('openai/gpt-4o');
  });

  it('maps finish_reason=length to max_tokens stopReason', async () => {
    mockFetch({
      id: 'g', choices: [{ message: { content: 'truncated...' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 100, completion_tokens: 4096, total_tokens: 4196 }, model: 'm',
    });

    const result = await provider.call({ model: 'test/model', messages: [{ role: 'user', content: 'x' }] });
    expect(result.stopReason).toBe('max_tokens');
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it('throws ProviderError on API error response', async () => {
    mockFetch({ error: { message: 'Invalid API key', type: 'authentication_error' } }, 401);

    await expect(
      provider.call({ model: 'test/model', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow('Invalid API key');
  });

  it('marks 429 errors as retryable', async () => {
    mockFetch({ error: { message: 'Rate limit exceeded' } }, 429);

    const { ProviderError } = await import('../models/provider.js');
    try {
      await provider.call({ model: 'test/model', messages: [{ role: 'user', content: 'x' }] });
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as InstanceType<typeof ProviderError>).retryable).toBe(true);
    }
  });

  it('throws non-retryable ProviderError when no API key', async () => {
    const noKeyProvider = new OpenRouterProvider({ apiKey: '' });
    const { ProviderError } = await import('../models/provider.js');

    await expect(
      noKeyProvider.call({ model: 'test/model', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  // ── pricing ─────────────────────────────────────────────────────────────────

  it('returns pricing for known models', () => {
    const p = provider.pricing('openrouter/openai/gpt-4o');
    expect(p.inputPer1M).toBe(2.5);
    expect(p.outputPer1M).toBe(10.0);
  });

  it('returns pricing for model without prefix', () => {
    const p = provider.pricing('anthropic/claude-sonnet-4-5');
    expect(p.inputPer1M).toBe(3.0);
  });

  it('returns default pricing for unknown models', () => {
    const p = provider.pricing('some-new/model-2099');
    expect(p.inputPer1M).toBeGreaterThan(0);
    expect(p.outputPer1M).toBeGreaterThan(0);
  });

  // ── OPENROUTER_PREFIX export ─────────────────────────────────────────────────

  it('exports OPENROUTER_PREFIX constant', () => {
    expect(OPENROUTER_PREFIX).toBe('openrouter/');
  });
});
