/**
 * AI_DESK — Anthropic Model Provider
 *
 * Uses fetch directly against api.anthropic.com — no SDK dependency.
 * Key resolution order: CredentialStore → constructor arg → ANTHROPIC_API_KEY env var.
 */
import {
  ModelProvider,
  ProviderError,
  type ModelCallOptions,
  type ModelCallResult,
  type ModelMessage,
  type ModelToolCall,
} from './provider.js';
import { readClaudeCodeCredentials, type CredentialStore } from '../auth/credential-store.js';

const API_URL     = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-opus-4-7': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-opus-4-6': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-sonnet-4-5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-haiku-4-5': { inputPer1M: 1.0, outputPer1M: 5.0 },
  'claude-haiku-3.5': { inputPer1M: 0.8, outputPer1M: 4.0 },
};

const DEFAULT_PRICING = { inputPer1M: 3.0, outputPer1M: 15.0 };

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export class AnthropicProvider extends ModelProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private credStore?: CredentialStore;

  constructor(opts?: { apiKey?: string; credStore?: CredentialStore }) {
    super();
    this.credStore = opts?.credStore;
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  }

  /**
   * Resolve the best available credential in priority order:
   *   1. CredentialStore API key (manually entered via dashboard)
   *   2. CredentialStore Claude Code OAuth token
   *   3. Env var ANTHROPIC_API_KEY
   *   4. Claude Code credentials file (~/.claude/.credentials.json)
   *
   * Returns { key, mode } where mode is 'api_key' or 'oauth'.
   */
  private resolveAuth(): { token: string; mode: 'api_key' | 'oauth' } | null {
    // 1. Stored API key
    const storedKey = this.credStore?.getApiKey('anthropic');
    if (storedKey) return { token: storedKey, mode: 'api_key' };

    // 2. Stored Claude Code OAuth token
    const storedOAuth = this.credStore?.getAnthropicOAuthToken();
    if (storedOAuth) return { token: storedOAuth, mode: 'oauth' };

    // 3. Env var
    if (this.apiKey) return { token: this.apiKey, mode: 'api_key' };

    // 4. Claude Code credentials file
    const cc = readClaudeCodeCredentials();
    if (cc) return { token: cc.accessToken, mode: 'oauth' };

    return null;
  }

  isAvailable(): boolean {
    return this.resolveAuth() !== null;
  }

  supportedModels(): string[] {
    return Object.keys(PRICING);
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } {
    const stripped = model.replace(/^anthropic\//, '');
    return PRICING[stripped] ?? DEFAULT_PRICING;
  }

  async call(options: ModelCallOptions): Promise<ModelCallResult> {
    const auth = this.resolveAuth();
    if (!auth) {
      throw new ProviderError(
        'Anthropic credential not configured. Add an API key via Dashboard → Credentials, ' +
        'set ANTHROPIC_API_KEY in .env, or install Claude Code (https://claude.ai/code).',
        this.name,
        options.model,
        false,
      );
    }

    const startTime = Date.now();
    const modelId   = options.model.replace(/^anthropic\//, '');

    const body = {
      model:       modelId,
      max_tokens:  options.maxTokens  ?? 4096,
      temperature: options.temperature ?? 0.7,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: this.toAnthropicMessages(options.messages),
      ...(options.tools && options.tools.length > 0 ? {
        tools: options.tools.map(t => ({
          name:         t.name,
          description:  t.description,
          input_schema: t.inputSchema,
        })),
      } : {}),
    };

    // Build auth headers — api_key uses x-api-key; OAuth uses Authorization: Bearer
    const authHeaders: Record<string, string> = auth.mode === 'oauth'
      ? { 'Authorization': `Bearer ${auth.token}` }
      : { 'x-api-key': auth.token };

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'anthropic-version': API_VERSION,
          ...authHeaders,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        modelId,
        true,
      );
    }

    const text = await response.text();
    let parsed: AnthropicResponse | AnthropicErrorResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError(
        `Invalid JSON response (status ${response.status}): ${text.slice(0, 200)}`,
        this.name,
        modelId,
        response.status >= 500,
        response.status,
      );
    }

    if (!response.ok || parsed.type === 'error') {
      const message = parsed.type === 'error'
        ? `${parsed.error.type}: ${parsed.error.message}`
        : `HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(message, this.name, modelId, retryable, response.status);
    }

    const result = parsed as AnthropicResponse;
    const content = result.content
      .filter((b): b is AnthropicContentBlock & { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('');

    const toolCalls: ModelToolCall[] = result.content
      .filter((b): b is AnthropicContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));

    const stopReason = result.stop_reason === 'tool_use' ? 'tool_use'
                     : result.stop_reason === 'max_tokens' ? 'max_tokens'
                     : 'end_turn';

    return {
      content,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        totalTokens: result.usage.input_tokens + result.usage.output_tokens,
        estimatedCost: this.computeCost(modelId, result.usage.input_tokens, result.usage.output_tokens),
      },
      model: result.model,
      durationMs: Date.now() - startTime,
    };
  }

  private toAnthropicMessages(messages: ModelMessage[]): unknown[] {
    const out: unknown[] = [];
    let i = 0;
    const msgs = messages.filter(m => m.role !== 'system');

    while (i < msgs.length) {
      const m = msgs[i];

      // Merge consecutive assistant tool-use messages into one API message.
      // The agent loop stores one assistant message per tool call; Anthropic requires
      // all tool_use blocks for a turn in a single assistant message.
      if (m.role === 'assistant' && m.toolName) {
        const blocks: AnthropicContentBlock[] = [];
        let textEmitted = false;
        while (i < msgs.length && msgs[i].role === 'assistant' && msgs[i].toolName) {
          const am = msgs[i];
          if (!textEmitted && am.content) {
            blocks.push({ type: 'text', text: am.content });
            textEmitted = true;
          }
          blocks.push({ type: 'tool_use', id: am.toolUseId ?? '', name: am.toolName!, input: am.toolInput ?? {} });
          i++;
        }
        out.push({ role: 'assistant', content: blocks });
        continue;
      }

      // Merge consecutive tool result messages into one user message.
      if (m.role === 'tool') {
        const blocks: AnthropicContentBlock[] = [];
        while (i < msgs.length && msgs[i].role === 'tool') {
          const tm = msgs[i];
          blocks.push({ type: 'tool_result', tool_use_id: tm.toolUseId ?? '', content: tm.content });
          i++;
        }
        out.push({ role: 'user', content: blocks });
        continue;
      }

      // Regular assistant message (no tool calls)
      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content });
        i++;
        continue;
      }

      // User message
      out.push({ role: 'user', content: m.content });
      i++;
    }

    return out;
  }
}
