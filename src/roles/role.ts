/**
 * AI_DESK — Agent Roles & Teams
 *
 * Re-exports the canonical types from the config schema so that
 * team-coordinator, the CLI, and the gateway all use the same type
 * without `as never` casts.
 *
 * TeamRunResult stays here because it is runtime-only (not configurable).
 */
export type { RoleConfig as RoleDefinition, TeamConfig as TeamDefinition } from '../config/schema.js';

export interface TeamMember {
  agentId: string;
  roleId: string;
}

export interface TeamRunResult {
  teamId: string;
  teamName: string;
  goal: string;
  success: boolean;
  synthesis: string;
  taskCount: number;
  doneCount: number;
  failedCount: number;
  totalDurationMs: number;
  tokensUsed: { input: number; output: number; total: number; cost: number };
}
