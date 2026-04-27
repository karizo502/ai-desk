/**
 * AI_DESK — OpenRouter Model Provider
 *
 * OpenRouter is an OpenAI-compatible aggregator that gives access to 200+
 * models (Claude, GPT-4o, Gemini, Llama, Mistral, etc.) through a single API.
 *
 * API:   https://openrouter.ai/api/v1/chat/completions
 * Auth:  Authorization: Bearer {API_KEY}
 * Docs:  https://openrouter.ai/docs
 *
 * Model name convention:
 *   In ai-desk config: "openrouter/anthropic/claude-sonnet-4-5"
 *   Sent to API:       "anthropic/claude-sonnet-4-5"   (openrouter/ prefix stripped)
 *
 * Key resolution: CredentialStore → constructor arg → OPENROUTER_API_KEY env var
 */
import {
  ModelProvider,
  ProviderError,
  type ModelCallOptions,
  type ModelCallResult,
  type ModelMessage,
  type ModelToolDefinition,
  type ModelToolCall,
} from './provider.js';
import type { CredentialStore } from '../auth/credential-store.js';

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Prefix used in ai-desk model config to route to OpenRouter */
export const OPENROUTER_PREFIX = 'openrouter/';

/**
 * Rough pricing fallback — OpenRouter charges the upstream model price +
 * a small margin. Values per 1M tokens (input/output). We track popular ones;
 * unknown models use the DEFAULT.
 */
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Anthropic via OpenRouter
  'anthropic/claude-opus-4':               { inputPer1M: 15.0,  outputPer1M: 75.0  },
  'anthropic/claude-sonnet-4-5':           { inputPer1M: 3.0,   outputPer1M: 15.0  },
  'anthropic/claude-3-5-haiku':            { inputPer1M: 0.8,   outputPer1M: 4.0   },
  'anthropic/claude-3-haiku':              { inputPer1M: 0.25,  outputPer1M: 1.25  },
  // OpenAI
  'openai/gpt-4o':                         { inputPer1M: 2.5,   outputPer1M: 10.0  },
  'openai/gpt-4o-mini':                    { inputPer1M: 0.15,  outputPer1M: 0.6   },
  'openai/gpt-4-turbo':                    { inputPer1M: 10.0,  outputPer1M: 30.0  },
  'openai/o1':                             { inputPer1M: 15.0,  outputPer1M: 60.0  },
  'openai/o3-mini':                        { inputPer1M: 1.1,   outputPer1M: 4.4   },
  // Google
  'google/gemini-2.5-flash':               { inputPer1M: 0.15,  outputPer1M: 0.6   },
  'google/gemini-2.5-pro':                 { inputPer1M: 1.25,  outputPer1M: 10.0  },
  'google/gemini-flash-1.5':               { inputPer1M: 0.075, outputPer1M: 0.3   },
  // Meta Llama (free tier available on OpenRouter)
  'meta-llama/llama-3.3-70b-instruct':     { inputPer1M: 0.4,   outputPer1M: 0.4   },
  'meta-llama/llama-3.1-8b-instruct':      { inputPer1M: 0.055, outputPer1M: 0.055 },
  // Mistral
  'mistralai/mistral-7b-instruct':         { inputPer1M: 0.055, outputPer1M: 0.055 },
  'mistralai/mixtral-8x7b-instruct':       { inputPer1M: 0.24,  outputPer1M: 0.24  },
  'mistralai/mistral-small':               { inputPer1M: 0.2,   outputPer1M: 0.6   },
  // DeepSeek
  'deepseek/deepseek-r1':                  { inputPer1M: 0.55,  outputPer1M: 2.19  },
  'deepseek/deepseek-chat':                { inputPer1M: 0.14,  outputPer1M: 0.28  },
};

const DEFAULT_PRICING = { inputPer1M: 3.0, outputPer1M: 15.0 };

// ─── OpenAI-wire types ────────────────────────────────────────────────────────

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OAIResponse {
  id: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OAIToolCall[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

interface OAIErrorResponse {
  error: { message: string; type?: string; code?: string | number };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class OpenRouterProvider extends ModelProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private credStore?: CredentialStore;

  constructor(opts?: { apiKey?: string; credStore?: CredentialStore }) {
    super();
    this.credStore = opts?.credStore;
    this.apiKey    = opts?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
  }

  private effectiveKey(): string {
    return this.credStore?.getApiKey('openrouter') ?? this.apiKey;
  }

  isAvailable(): boolean {
    return this.effectiveKey().length > 0;
  }

  /**
   * OpenRouter supports any model — we list popular ones for display purposes,
   * but will route any `openrouter/<anything>` model name through the API.
   */
  supportedModels(): string[] {
    return Object.keys(PRICING);
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } {
    const stripped = this.stripPrefix(model);
    return PRICING[stripped] ?? DEFAULT_PRICING;
  }

  async call(options: ModelCallOptions): Promise<ModelCallResult> {
    const key = this.effectiveKey();
    if (!key) {
      throw new ProviderError(
        'OpenRouter API key not configured. Add it via the Dashboard → Credentials tab or set OPENROUTER_API_KEY in .env',
        this.name,
        options.model,
        false,
      );
    }

    const startTime = Date.now();
    const modelId   = this.stripPrefix(options.model);   // e.g. "anthropic/claude-sonnet-4-5"

    const body: Record<string, unknown> = {
      model:       modelId,
      max_tokens:  options.maxTokens  ?? 4096,
      temperature: options.temperature ?? 0.7,
      messages:    this.toOAIMessages(options.messages, options.systemPrompt),
    };

    if (options.tools && options.tools.length > 0) {
      body['tools']       = this.toOAITools(options.tools);
      body['tool_choice'] = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer':  'https://ai-desk.local',
          'X-Title':       'AI_DESK',
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
    let parsed: OAIResponse | OAIErrorResponse;
    try {
      parsed = JSON.parse(text) as OAIResponse | OAIErrorResponse;
    } catch {
      throw new ProviderError(
        `Invalid JSON response (status ${response.status}): ${text.slice(0, 200)}`,
        this.name,
        modelId,
        response.status >= 500,
        response.status,
      );
    }

    if (!response.ok || 'error' in parsed) {
      const msg      = 'error' in parsed ? parsed.error.message : `HTTP ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(msg, this.name, modelId, retryable, response.status);
    }

    const result  = parsed as OAIResponse;
    const choice  = result.choices[0];
    const content = choice?.message.content ?? '';

    const toolCalls: ModelToolCall[] = (choice?.message.tool_calls ?? []).map(tc => {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch {}
      return { id: tc.id, name: tc.function.name, input };
    });

    const stopReason =
      choice?.finish_reason === 'tool_calls' ? 'tool_use' :
      choice?.finish_reason === 'length'     ? 'max_tokens' : 'end_turn';

    const usage = result.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      content,
      toolCalls,
      stopReason,
      usage: {
        inputTokens:   usage.prompt_tokens,
        outputTokens:  usage.completion_tokens,
        totalTokens:   usage.total_tokens,
        estimatedCost: this.computeCost(modelId, usage.prompt_tokens, usage.completion_tokens),
      },
      model: result.model ?? modelId,
      durationMs: Date.now() - startTime,
    };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Strip `openrouter/` prefix to get the upstream model id */
  private stripPrefix(model: string): string {
    return model.startsWith(OPENROUTER_PREFIX)
      ? model.slice(OPENROUTER_PREFIX.length)
      : model;
  }

  /** Convert internal messages to OpenAI wire format */
  private toOAIMessages(messages: ModelMessage[], systemPrompt?: string): OAIMessage[] {
    const out: OAIMessage[] = [];

    if (systemPrompt) {
      out.push({ role: 'system', content: systemPrompt });
    }

    const nonSystem = messages.filter(m => m.role !== 'system');
    let i = 0;

    while (i < nonSystem.length) {
      const m = nonSystem[i];

      // Collect a batch of assistant tool-use messages into one OAI assistant turn
      if (m.role === 'assistant' && m.toolName) {
        const tool_calls: OAIToolCall[] = [];
        let textContent: string | null = null;
        while (i < nonSystem.length && nonSystem[i].role === 'assistant' && nonSystem[i].toolName) {
          const am = nonSystem[i];
          if (!textContent && am.content) textContent = am.content;
          tool_calls.push({
            id:   am.toolUseId ?? `call_${i}`,
            type: 'function',
            function: {
              name:      am.toolName!,
              arguments: JSON.stringify(am.toolInput ?? {}),
            },
          });
          i++;
        }
        out.push({ role: 'assistant', content: textContent, tool_calls });
        continue;
      }

      // Tool result → OAI `tool` role
      if (m.role === 'tool') {
        while (i < nonSystem.length && nonSystem[i].role === 'tool') {
          const tm = nonSystem[i];
          out.push({
            role:         'tool',
            content:      tm.content,
            tool_call_id: tm.toolUseId ?? '',
          });
          i++;
        }
        continue;
      }

      // Regular assistant / user
      out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      i++;
    }

    return out;
  }

  /** Convert internal tool definitions to OpenAI function-calling format */
  private toOAITools(tools: ModelToolDefinition[]): unknown[] {
    return tools.map(t => ({
      type: 'function',
      function: {
        name:        t.name,
        description: t.description,
        parameters:  t.inputSchema,
      },
    }));
  }
}
