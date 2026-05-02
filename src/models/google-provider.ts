/**
 * AI_DESK — Google Gemini Provider
 *
 * Uses fetch directly against generativelanguage.googleapis.com.
 * Credential resolution order:
 *   1. CredentialStore OAuth token (auto-refreshed)
 *   2. CredentialStore API key
 *   3. GOOGLE_AI_API_KEY / GEMINI_API_KEY env vars
 */
import {
  ModelProvider,
  ProviderError,
  type ModelCallOptions,
  type ModelCallResult,
  type ModelMessage,
  type ModelToolCall,
} from './provider.js';
import type { CredentialStore } from '../auth/credential-store.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CODE_ASSIST_URL = 'https://cloudcode-pa.googleapis.com/v1internal:generateContent';

const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.0375, outputPer1M: 0.15 },
  'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
};

const DEFAULT_PRICING = { inputPer1M: 0.075, outputPer1M: 0.3 };

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiCandidate {
  content: { role: string; parts: GeminiPart[] };
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'OTHER';
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

export class GoogleProvider extends ModelProvider {
  readonly name = 'google';
  private apiKey: string;
  private credStore?: CredentialStore;

  constructor(opts?: { apiKey?: string; credStore?: CredentialStore }) {
    super();
    this.credStore = opts?.credStore;
    this.apiKey = opts?.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
  }

  isAvailable(): boolean {
    // Available if any credential path is configured
    if (this.apiKey.length > 0) return true;
    const stored = this.credStore?.get('google');
    return !!stored;
  }

  supportedModels(): string[] {
    return Object.keys(PRICING);
  }

  pricing(model: string): { inputPer1M: number; outputPer1M: number } {
    const stripped = model.replace(/^google\//, '');
    return PRICING[stripped] ?? DEFAULT_PRICING;
  }

  async call(options: ModelCallOptions): Promise<ModelCallResult> {
    // Resolve credential: OAuth first (auto-refreshed), then API key, then env var
    const oauthToken = this.credStore ? await this.credStore.getValidGoogleAccessToken() : undefined;
    const codeAssist = this.credStore?.getGoogleCodeAssistInfo();
    const useCodeAssist = !!(oauthToken && codeAssist?.useCodeAssist && codeAssist.projectId);
    const storedApiKey = this.credStore?.getApiKey('google');
    const effectiveApiKey = storedApiKey ?? this.apiKey;

    if (!oauthToken && !effectiveApiKey) {
      throw new ProviderError(
        'Google API credentials not configured. Add them via the Dashboard → Credentials tab or set GOOGLE_AI_API_KEY in .env',
        this.name,
        options.model,
        false,
      );
    }

    const startTime = Date.now();
    const modelId = options.model.replace(/^google\//, '');

    const innerRequest: Record<string, unknown> = {
      contents: this.toGeminiContents(options.messages),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (options.systemPrompt) {
      innerRequest.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    if (options.tools && options.tools.length > 0) {
      innerRequest.tools = [{
        functionDeclarations: options.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      }];
    }

    // Choose endpoint + body shape based on auth method
    let url: string;
    let body: Record<string, unknown>;
    if (useCodeAssist) {
      url = CODE_ASSIST_URL;
      body = { model: modelId, project: codeAssist!.projectId, request: innerRequest };
    } else if (oauthToken) {
      url = `${API_BASE}/${modelId}:generateContent`;
      body = innerRequest;
    } else {
      url = `${API_BASE}/${modelId}:generateContent?key=${encodeURIComponent(effectiveApiKey)}`;
      body = innerRequest;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (oauthToken) headers['Authorization'] = `Bearer ${oauthToken}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
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
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(
        `HTTP ${response.status}: ${text.slice(0, 300)}`,
        this.name,
        modelId,
        retryable,
        response.status,
      );
    }

    let parsed: GeminiResponse;
    try {
      const raw = JSON.parse(text) as GeminiResponse | { response: GeminiResponse };
      // Code Assist wraps the standard Gemini response under `response`
      parsed = 'response' in raw && raw.response ? raw.response : (raw as GeminiResponse);
    } catch {
      throw new ProviderError(`Invalid JSON: ${text.slice(0, 200)}`, this.name, modelId, false);
    }

    const candidate = parsed.candidates?.[0];
    if (!candidate) {
      throw new ProviderError('Empty response (no candidate)', this.name, modelId, false);
    }

    const parts = candidate.content?.parts ?? [];
    const content = parts.filter(p => p.text).map(p => p.text!).join('');

    const toolCalls: ModelToolCall[] = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: `gem_${Date.now()}_${i}`,
        name: p.functionCall!.name,
        input: p.functionCall!.args,
      }));

    const stopReason = toolCalls.length > 0 ? 'tool_use'
                     : candidate.finishReason === 'MAX_TOKENS' ? 'max_tokens'
                     : 'end_turn';

    const inputTokens = parsed.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = parsed.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content,
      toolCalls,
      stopReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCost: this.computeCost(modelId, inputTokens, outputTokens),
      },
      model: parsed.modelVersion ?? modelId,
      durationMs: Date.now() - startTime,
    };
  }

  private toGeminiContents(messages: ModelMessage[]): unknown[] {
    const out: unknown[] = [];
    let i = 0;
    const msgs = messages.filter(m => m.role !== 'system');

    while (i < msgs.length) {
      const m = msgs[i];

      // Merge consecutive assistant tool-use messages into one model turn.
      if (m.role === 'assistant' && m.toolName) {
        const parts: GeminiPart[] = [];
        let textEmitted = false;
        while (i < msgs.length && msgs[i].role === 'assistant' && msgs[i].toolName) {
          const am = msgs[i];
          if (!textEmitted && am.content) {
            parts.push({ text: am.content });
            textEmitted = true;
          }
          parts.push({ functionCall: { name: am.toolName!, args: am.toolInput ?? {} } });
          i++;
        }
        out.push({ role: 'model', parts });
        continue;
      }

      // Merge consecutive tool result messages into one user turn.
      if (m.role === 'tool') {
        const parts: GeminiPart[] = [];
        while (i < msgs.length && msgs[i].role === 'tool') {
          const tm = msgs[i];
          parts.push({ functionResponse: { name: tm.toolName ?? 'tool', response: { result: tm.content } } });
          i++;
        }
        out.push({ role: 'user', parts });
        continue;
      }

      // Regular assistant message
      if (m.role === 'assistant') {
        out.push({ role: 'model', parts: [{ text: m.content }] });
        i++;
        continue;
      }

      // User message
      out.push({ role: 'user', parts: [{ text: m.content }] });
      i++;
    }

    return out;
  }
}
