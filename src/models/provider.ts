/**
 * AI_DESK — Model Provider Interface
 *
 * Common abstraction for all LLM providers.
 * Implementations: anthropic, google, openai (future).
 */

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ModelCallOptions {
  model: string;
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ModelToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ModelCallResult {
  content: string;
  toolCalls: ModelToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  model: string;
  durationMs: number;
}

export interface ProviderInfo {
  name: string;
  supportedModels: string[];
  available: boolean;
  reason?: string;
}

export abstract class ModelProvider {
  abstract readonly name: string;

  /** Returns true if provider can be used (API key present, etc.) */
  abstract isAvailable(): boolean;

  /** Names of models this provider supports (e.g., ["claude-sonnet-4-6"]) */
  abstract supportedModels(): string[];

  /** Per-model price per 1M tokens (input, output) — used for cost estimation */
  abstract pricing(model: string): { inputPer1M: number; outputPer1M: number };

  /** Make a single (non-streaming) model call */
  abstract call(options: ModelCallOptions): Promise<ModelCallResult>;

  /** Estimate token count without calling the API (rough — 4 chars/token) */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** Compute cost given pricing and token usage */
  protected computeCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = this.pricing(model);
    return (inputTokens / 1_000_000) * p.inputPer1M
         + (outputTokens / 1_000_000) * p.outputPer1M;
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
