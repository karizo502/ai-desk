/**
 * AI_DESK — Skill Auto-Trigger
 *
 * Enqueues a synthesis job after a successful agent session when:
 *   1. The session had >= autoTriggerMinToolCalls tool calls
 *   2. No existing enabled skill already covers the task (content similarity check)
 *   3. Rate limit permits a synthesis
 *
 * Fire-and-forget: errors are logged, never thrown to the caller.
 * The hot path (AgentRuntime) must never be blocked by this.
 */
import type { SkillTraceStore } from '../memory/skill-trace-store.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillSynthesizer } from './skill-synthesizer.js';
import type { SkillSynthesisConfig } from '../config/schema.js';
import { eventBus } from '../shared/events.js';

export interface AutoTriggerOptions {
  agentId: string;
  sessionId: string;
  toolCallCount: number;
  projectRoot?: string;
}

export class SkillAutoTrigger {
  private traceStore: SkillTraceStore;
  private registry: SkillRegistry;
  private synthesizer: SkillSynthesizer;
  private config: SkillSynthesisConfig;

  constructor(deps: {
    traceStore: SkillTraceStore;
    registry: SkillRegistry;
    synthesizer: SkillSynthesizer;
    config: SkillSynthesisConfig;
  }) {
    this.traceStore = deps.traceStore;
    this.registry = deps.registry;
    this.synthesizer = deps.synthesizer;
    this.config = deps.config;
  }

  /**
   * Evaluate whether this session warrants synthesis and, if so, enqueue it.
   * Returns immediately — synthesis runs in the background.
   */
  maybeEnqueue(opts: AutoTriggerOptions): void {
    if (opts.toolCallCount < this.config.autoTriggerMinToolCalls) return;
    if (this.alreadyCovered(opts.sessionId)) return;

    // Fire-and-forget synthesis
    this.runSynthesis(opts).catch(err => {
      eventBus.emit('skills:synth:failed', {
        sessionIds: [opts.sessionId],
        agentId: opts.agentId,
        error: `Auto-trigger error: ${(err as Error).message}`,
      });
    });
  }

  /** Check if any enabled skill's description overlaps enough with this session's content */
  private alreadyCovered(sessionId: string): boolean {
    const turns = this.traceStore.getTrace(sessionId);
    const firstUser = turns.find(t => t.role === 'user');
    if (!firstUser) return false;

    const sessionWords = wordSet(firstUser.content);
    const enabledSkills = this.registry.list().filter(s => s.state.enabled);

    for (const skill of enabledSkills) {
      const skillWords = wordSet(skill.definition.description + ' ' + (skill.definition.systemPromptAddition ?? ''));
      const sim = jaccard(sessionWords, skillWords);
      if (sim >= 0.35) return true; // Covered
    }
    return false;
  }

  private async runSynthesis(opts: AutoTriggerOptions): Promise<void> {
    eventBus.emit('skills:synth:started', {
      sessionIds: [opts.sessionId],
      agentId: opts.agentId,
      mode: 'auto-trigger',
    });

    await this.synthesizer.synthesize([opts.sessionId], {
      agentId: opts.agentId,
      projectRoot: opts.projectRoot,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'was', 'its', 'this', 'that', 'with', 'use']);

function wordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
