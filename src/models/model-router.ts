/**
 * AI_DESK — Smart Model Router
 *
 * Picks the right model for the right task. Handles failover.
 * Routes: complexity heuristic → primary | flash | failover chain.
 */
import { eventBus } from '../shared/events.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GoogleProvider } from './google-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import {
  ModelProvider,
  ProviderError,
  type ModelCallOptions,
  type ModelCallResult,
} from './provider.js';
import type { ModelConfig } from '../config/schema.js';
import type { CredentialStore } from '../auth/credential-store.js';

export type TaskComplexity = 'simple' | 'normal' | 'complex';

export interface RouteOptions extends Omit<ModelCallOptions, 'model'> {
  complexity?: TaskComplexity;
  preferredModel?: string;
  forSubagent?: boolean;
}

export class ModelRouter {
  private providers = new Map<string, ModelProvider>();
  private modelToProvider = new Map<string, ModelProvider>();
  private modelConfig: ModelConfig;
  private subagentModel: string;

  constructor(modelConfig: ModelConfig, subagentModel: string, credStore?: CredentialStore) {
    this.modelConfig = modelConfig;
    this.subagentModel = subagentModel;

    this.register(new AnthropicProvider({ credStore }));
    this.register(new GoogleProvider({ credStore }));
    this.register(new OpenRouterProvider({ credStore }));
  }

  /** Register a provider and index its supported models */
  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
    for (const m of provider.supportedModels()) {
      this.modelToProvider.set(`${provider.name}/${m}`, provider);
      // Only register the bare model name when it has no provider prefix of its own.
      // OpenRouter returns names like 'anthropic/claude-sonnet-4-5' which must NOT
      // overwrite the real AnthropicProvider's registration for the same key.
      if (!m.includes('/')) {
        this.modelToProvider.set(m, provider);
      }
    }
  }

  /** List available providers and their state */
  status(): Array<{ name: string; available: boolean; models: string[] }> {
    return [...this.providers.values()].map(p => ({
      name: p.name,
      available: p.isAvailable(),
      models: p.supportedModels(),
    }));
  }

  /** Pick a model for a task, considering complexity and sub-agent constraints */
  pickModel(opts: { complexity?: TaskComplexity; preferredModel?: string; forSubagent?: boolean }): string {
    if (opts.forSubagent) {
      // Sub-agents are ALWAYS forced to flash/cheap models for cost discipline.
      return this.subagentModel;
    }

    if (opts.preferredModel) {
      return opts.preferredModel;
    }

    const c = opts.complexity ?? 'normal';
    if (c === 'simple') {
      // Cheap fast model for simple tasks (also used as compaction model)
      return this.modelConfig.compaction ?? this.subagentModel;
    }

    return this.modelConfig.primary;
  }

  /** Make a routed call with automatic failover */
  async call(opts: RouteOptions): Promise<ModelCallResult> {
    const primary = this.pickModel(opts);
    const failoverChain = [
      primary,
      ...(opts.forSubagent ? [] : (this.modelConfig.failover ?? [])),
    ];

    let lastError: Error | null = null;

    for (const model of failoverChain) {
      const provider = this.resolveProvider(model);
      if (!provider) {
        lastError = new Error(`No provider registered for model "${model}"`);
        continue;
      }
      if (!provider.isAvailable()) {
        lastError = new Error(`Provider "${provider.name}" not available (missing API key)`);
        continue;
      }

      eventBus.emit('agent:start', { model, provider: provider.name });

      try {
        const result = await provider.call({
          model,
          messages: opts.messages,
          tools: opts.tools,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          systemPrompt: opts.systemPrompt,
        });

        eventBus.emit('agent:end', {
          model: result.model,
          provider: provider.name,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cost: result.usage.estimatedCost,
        });

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryable = err instanceof ProviderError ? err.retryable : false;
        eventBus.emit('agent:error', {
          model,
          provider: provider.name,
          error: lastError.message,
          willFailover: retryable && model !== failoverChain[failoverChain.length - 1],
        });
        if (!retryable) break;
      }
    }

    throw lastError ?? new Error('Model call failed with no error captured');
  }

  /** Find the provider for a given model id (with or without "provider/" prefix) */
  private resolveProvider(model: string): ModelProvider | undefined {
    const exact = this.modelToProvider.get(model);
    if (exact) return exact;

    if (model.includes('/')) {
      const [providerName] = model.split('/');
      return this.providers.get(providerName);
    }

    return undefined;
  }
}
