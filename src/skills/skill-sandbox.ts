/**
 * AI_DESK — Skill Sandbox Replay
 *
 * Evaluates whether a candidate skill would have improved a recorded session.
 * Calls the LLM with the session trace and skill instructions and asks it to
 * estimate the impact (token/tool-call delta).
 *
 * This is NOT a full agent re-execution — it is an LLM-judged impact assessment.
 * The result feeds into: dashboard skill health cards + approval-flow confidence scores.
 */
import type { ModelRouter } from '../models/model-router.js';
import type { TracedTurn } from '../memory/skill-trace-store.js';
import type { SkillDefinition } from './skill.js';

export interface SandboxReplayOptions {
  /** Max turns to include in the replay context (default 40) */
  maxTurns?: number;
  /** Model to use for the judge call (defaults to router.pickModel) */
  model?: string;
}

export interface SandboxReplayResult {
  /** Positive = skill costs more tokens; negative = skill saves tokens */
  estimatedTokenDelta: number;
  /** Net change in tool calls (negative = fewer calls) */
  estimatedToolCallDelta: number;
  /** LLM confidence that the skill would have helped (0–1) */
  confidence: number;
  /** Free-text reasoning from the judge model */
  assessment: string;
  /** Whether the replay succeeded (false if LLM returned unparseable output) */
  ok: boolean;
  error?: string;
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

function buildJudgePrompt(
  skill: Pick<SkillDefinition, 'name' | 'description' | 'systemPromptAddition'>,
  turns: TracedTurn[],
): string {
  const traceSummary = turns
    .slice(0, 40)
    .map(t => {
      if (t.role === 'user') return `USER: ${t.content.slice(0, 300)}`;
      if (t.role === 'tool') return `TOOL(${t.toolName ?? '?'}): ${(t.toolOutput ?? t.content).slice(0, 200)}`;
      return `ASSISTANT: ${t.content.slice(0, 300)}`;
    })
    .join('\n');

  const toolCallCount = turns.filter(t => t.role === 'tool').length;
  const totalContentLen = turns.reduce((s, t) => s + t.content.length, 0);
  const estimatedTokens = Math.round(totalContentLen / 4);

  return `You are an AI assistant evaluating whether a skill directive would have improved agent efficiency.

SKILL NAME: ${skill.name}
SKILL DESCRIPTION: ${skill.description}
SKILL INSTRUCTIONS (would be prepended to system prompt):
---
${skill.systemPromptAddition ?? '(none)'}
---

SESSION TRACE SUMMARY (${toolCallCount} tool calls, ~${estimatedTokens} tokens):
---
${traceSummary}
---

Analyse whether adding the skill instructions would have helped the agent complete this session more efficiently.

Respond with ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "estimatedTokenDelta": <integer, negative means skill saves tokens>,
  "estimatedToolCallDelta": <integer, negative means fewer tool calls>,
  "confidence": <float 0.0-1.0>,
  "assessment": "<one or two sentences>"
}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export class SkillSandbox {
  private router: ModelRouter;

  constructor(router: ModelRouter) {
    this.router = router;
  }

  async replay(
    skill: Pick<SkillDefinition, 'name' | 'description' | 'systemPromptAddition'>,
    turns: TracedTurn[],
    opts: SandboxReplayOptions = {},
  ): Promise<SandboxReplayResult> {
    const maxTurns = opts.maxTurns ?? 40;
    const slicedTurns = turns.slice(0, maxTurns);

    if (slicedTurns.length === 0) {
      return {
        estimatedTokenDelta: 0,
        estimatedToolCallDelta: 0,
        confidence: 0,
        assessment: 'No turns to replay.',
        ok: false,
        error: 'Empty trace',
      };
    }

    const prompt = buildJudgePrompt(skill, slicedTurns);
    const model = opts.model ?? this.router.pickModel({ complexity: 'simple' });

    let raw: string;
    try {
      const response = await this.router.call({
        preferredModel: model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 256,
      });
      raw = response.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        estimatedTokenDelta: 0,
        estimatedToolCallDelta: 0,
        confidence: 0,
        assessment: '',
        ok: false,
        error: `Router error: ${msg}`,
      };
    }

    // Strip markdown fences if present
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      const parsed = JSON.parse(jsonText) as {
        estimatedTokenDelta: number;
        estimatedToolCallDelta: number;
        confidence: number;
        assessment: string;
      };

      return {
        estimatedTokenDelta: Number(parsed.estimatedTokenDelta) || 0,
        estimatedToolCallDelta: Number(parsed.estimatedToolCallDelta) || 0,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
        assessment: String(parsed.assessment ?? ''),
        ok: true,
      };
    } catch {
      return {
        estimatedTokenDelta: 0,
        estimatedToolCallDelta: 0,
        confidence: 0,
        assessment: '',
        ok: false,
        error: `Failed to parse judge response: ${raw.slice(0, 200)}`,
      };
    }
  }
}
