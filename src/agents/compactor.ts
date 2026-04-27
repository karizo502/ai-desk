/**
 * AI_DESK — Context Compactor
 *
 * When transcript grows too large, summarise older turns using a cheap model.
 * Threshold based on configured ratio of estimated tokens to model context window.
 */
import type { ModelMessage } from '../models/provider.js';
import type { ModelRouter } from '../models/model-router.js';
import type { MemoryConfig } from '../config/schema.js';
import { eventBus } from '../shared/events.js';

const APPROX_CONTEXT_WINDOW = 200_000; // sane default for current Claude/Gemini
const KEEP_RECENT_TURNS = 6;            // always keep last N user/assistant turns verbatim

export class ContextCompactor {
  private router: ModelRouter;
  private config: MemoryConfig;

  constructor(router: ModelRouter, config: MemoryConfig) {
    this.router = router;
    this.config = config;
    if (config.backend === 'sqlite-vec') {
      process.stderr.write(
        '[AI_DESK] WARNING: memory.backend "sqlite-vec" is not yet implemented — ' +
        'falling back to text-based compaction (backend: "none" behaviour). ' +
        'Change to "none" to suppress this warning.\n'
      );
    }
  }

  /** True if the transcript should be compacted */
  shouldCompact(messages: ModelMessage[]): boolean {
    const estTokens = this.estimate(messages);
    return estTokens / APPROX_CONTEXT_WINDOW >= this.config.compaction.threshold;
  }

  /** Roll the older portion of the transcript into a single summary message */
  async compact(messages: ModelMessage[], systemPrompt?: string): Promise<ModelMessage[]> {
    if (messages.length <= KEEP_RECENT_TURNS + 1) return messages;

    // Always keep system summary placeholder + last N turns
    const head = messages.slice(0, messages.length - KEEP_RECENT_TURNS);
    const tail = messages.slice(messages.length - KEEP_RECENT_TURNS);

    const before = this.estimate(messages);
    eventBus.emit('agent:start', {
      phase: 'compaction',
      messages: head.length,
      estimatedTokens: this.estimate(head),
    });

    const transcriptText = head.map(m => {
      if (m.role === 'tool') return `[Tool result for ${m.toolName ?? 'tool'}]: ${m.content}`;
      if (m.toolName) return `${m.role} (tool_use ${m.toolName}): ${m.content}`;
      return `${m.role}: ${m.content}`;
    }).join('\n\n');

    const summaryPrompt =
      'Summarise this conversation transcript in under 400 words. Preserve: ' +
      'user goals, decisions made, files/identifiers mentioned, and any pending tasks. ' +
      'Drop pleasantries and verbose explanations.';

    const result = await this.router.call({
      messages: [{ role: 'user', content: `${summaryPrompt}\n\n---\n${transcriptText}` }],
      systemPrompt,
      complexity: 'simple',
      preferredModel: this.config.compaction.model,
      maxTokens: 1024,
      temperature: 0.2,
    });

    const summarised: ModelMessage = {
      role: 'user',
      content: `[Conversation summary so far]\n${result.content}`,
    };

    const after = this.estimate([summarised, ...tail]);
    eventBus.emit('agent:end', {
      phase: 'compaction',
      tokensBefore: before,
      tokensAfter: after,
      compressionRatio: before > 0 ? after / before : 1,
    });

    return [summarised, ...tail];
  }

  /** Rough token count (4 chars/token) — tracks across compaction triggers */
  estimate(messages: ModelMessage[]): number {
    let chars = 0;
    for (const m of messages) {
      chars += m.content.length;
      if (m.toolInput) chars += JSON.stringify(m.toolInput).length;
    }
    return Math.ceil(chars / 4);
  }
}
