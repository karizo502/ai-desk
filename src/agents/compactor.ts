/**
 * AI_DESK — Context Compactor
 *
 * When transcript grows too large, summarise older turns using a cheap model.
 * Threshold based on configured ratio of estimated tokens to model context window.
 *
 * With backend = 'sqlite-vec':
 *   - After compaction, extract key facts and store them in MemoryStore
 *   - buildMemoryContext() injects relevant memories into the system prompt
 */
import type { ModelMessage } from '../models/provider.js';
import type { ModelRouter } from '../models/model-router.js';
import type { MemoryConfig } from '../config/schema.js';
import type { MemoryStore } from '../memory/memory-store.js';
import { eventBus } from '../shared/events.js';

const APPROX_CONTEXT_WINDOW = 200_000;
const KEEP_RECENT_TURNS = 6;

export class ContextCompactor {
  private router: ModelRouter;
  private config: MemoryConfig;
  private memoryStore: MemoryStore | null = null;

  constructor(router: ModelRouter, config: MemoryConfig, memoryStore?: MemoryStore) {
    this.router = router;
    this.config = config;
    if (config.backend === 'sqlite-vec') {
      if (memoryStore) {
        this.memoryStore = memoryStore;
      } else {
        process.stderr.write(
          '[AI_DESK] WARNING: memory.backend "sqlite-vec" requires a MemoryStore instance — ' +
          'falling back to text-based compaction. Pass memoryStore to ContextCompactor.\n'
        );
      }
    }
  }

  /** True if the transcript should be compacted */
  shouldCompact(messages: ModelMessage[]): boolean {
    const estTokens = this.estimate(messages);
    return estTokens / APPROX_CONTEXT_WINDOW >= this.config.compaction.threshold;
  }

  /**
   * Inject relevant long-term memories into the working transcript.
   * Call this before the agent loop when backend = 'sqlite-vec'.
   * Returns the transcript unchanged when no memory backend is configured.
   */
  async buildMemoryContext(
    messages: ModelMessage[],
    agentId: string,
    query: string,
  ): Promise<ModelMessage[]> {
    if (!this.memoryStore) return messages;

    const memories = this.memoryStore.retrieve(agentId, query);
    if (memories.length === 0) return messages;

    const memBlock = memories.map(m => `• ${m.content}`).join('\n');
    const memMsg: ModelMessage = {
      role: 'user',
      content: `[Long-term memory — relevant context from past sessions]\n${memBlock}`,
    };

    // Insert memory block before the first user message so it feels like context
    const firstUserIdx = messages.findIndex(m => m.role === 'user');
    if (firstUserIdx === -1) return [memMsg, ...messages];

    return [
      ...messages.slice(0, firstUserIdx),
      memMsg,
      ...messages.slice(firstUserIdx),
    ];
  }

  /** Roll the older portion of the transcript into a single summary message */
  async compact(
    messages: ModelMessage[],
    systemPrompt?: string,
    agentId?: string,
    sessionId?: string,
  ): Promise<ModelMessage[]> {
    if (messages.length <= KEEP_RECENT_TURNS + 1) return messages;

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

    // Extract and store memories when backend is enabled
    if (this.memoryStore && agentId && sessionId) {
      this.extractAndStore(transcriptText, agentId, sessionId).catch(() => {});
    }

    return [summarised, ...tail];
  }

  /** Rough token count (4 chars/token) */
  estimate(messages: ModelMessage[]): number {
    let chars = 0;
    for (const m of messages) {
      chars += m.content.length;
      if (m.toolInput) chars += JSON.stringify(m.toolInput).length;
    }
    return Math.ceil(chars / 4);
  }

  /** Extract key facts from a transcript and persist to MemoryStore */
  private async extractAndStore(
    transcriptText: string,
    agentId: string,
    sessionId: string,
  ): Promise<void> {
    if (!this.memoryStore) return;

    const extractPrompt =
      'Extract 3 to 8 key facts from this conversation worth remembering for future sessions.\n' +
      'Focus on: user name/preferences, decisions made, important file paths or IDs, goals, and outcomes.\n' +
      'Format: one fact per line starting with "- ". Be concise (under 20 words each). No duplicates.\n\n' +
      '---\n' + transcriptText.slice(0, 6000);

    try {
      const result = await this.router.call({
        messages: [{ role: 'user', content: extractPrompt }],
        complexity: 'simple',
        preferredModel: this.config.compaction.model,
        maxTokens: 512,
        temperature: 0.1,
      });

      const lines = result.content
        .split('\n')
        .map(l => l.replace(/^[-•*]\s*/, '').trim())
        .filter(l => l.length > 10 && l.length < 300);

      for (const fact of lines) {
        this.memoryStore.store(agentId, sessionId, fact, 0.6);
      }

      this.memoryStore.pruneOverflow(agentId);

      eventBus.emit('memory:stored', { agentId, count: lines.length });
    } catch {
      // Non-critical — memory extraction failure should not affect the main run
    }
  }
}
