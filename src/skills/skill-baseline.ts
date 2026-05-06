/**
 * AI_DESK — Skill Baseline Finder
 *
 * Finds comparable past sessions (without a given skill) to compute a
 * token-savings baseline for ROI tracking.
 *
 * Algorithm:
 *   1. Get the current session's first user message as the content query
 *   2. FTS5-search skill_sessions for similar successful sessions
 *   3. Exclude sessions where the target skill was already active
 *   4. Return the average token count of matching sessions (or null if none)
 */
import type { SkillTraceStore } from '../memory/skill-trace-store.js';

export interface BaselineResult {
  /** Average token count of matching baseline sessions */
  baselineTokens: number;
  /** How many sessions contributed to the baseline */
  sampleCount: number;
}

export class SkillBaselineFinder {
  private traceStore: SkillTraceStore;
  /** Minimum sessions required to trust the baseline */
  private readonly minSamples: number;

  constructor(traceStore: SkillTraceStore, minSamples = 2) {
    this.traceStore = traceStore;
    this.minSamples = minSamples;
  }

  /**
   * Find a token baseline for `skillName` relative to `sessionId`.
   * Returns null if there are not enough comparable sessions.
   */
  async findBaseline(
    agentId: string,
    sessionId: string,
    skillName: string,
  ): Promise<BaselineResult | null> {
    // Get the session's first user turn as the FTS query
    const turns = this.traceStore.getTrace(sessionId);
    const firstUser = turns.find(t => t.role === 'user');
    const contentQuery = firstUser?.content.slice(0, 200) ?? '';

    const baselines = this.traceStore.findBaselineSessions(
      agentId,
      skillName,
      contentQuery,
      10,
    );

    // Filter out the session itself and sessions with zero tokens
    const candidates = baselines.filter(
      s => s.id !== sessionId && s.tokenCount > 0,
    );

    if (candidates.length < this.minSamples) return null;

    const totalTokens = candidates.reduce((sum, s) => sum + s.tokenCount, 0);
    return {
      baselineTokens: Math.round(totalTokens / candidates.length),
      sampleCount: candidates.length,
    };
  }

  /**
   * Compute the token delta for a session vs its baseline.
   * Positive = skill used more tokens (bad); negative = saved tokens (good).
   * Returns null when no baseline is available.
   */
  async computeTokenDelta(
    agentId: string,
    sessionId: string,
    skillName: string,
    sessionTokens: number,
  ): Promise<number | null> {
    const baseline = await this.findBaseline(agentId, sessionId, skillName);
    if (baseline === null) return null;
    return sessionTokens - baseline.baselineTokens;
  }
}
