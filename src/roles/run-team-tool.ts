/**
 * AI_DESK — run_team tool factory
 *
 * Creates a per-request tool that lets a lead agent voluntarily delegate
 * a goal to its team. The tool is injected at runtime (not registered in
 * ToolRegistry) so it carries the channelId/peerId of the current user
 * session and bypasses the policy engine (trusted internal operation).
 */
import type { TeamCoordinator } from './team-coordinator.js';
import type { RegisteredTool } from '../agents/tool-registry.js';

export function buildRunTeamTool(opts: {
  teamCoordinator: TeamCoordinator;
  defaultTeamId: string;
  channelId: string;
  peerId: string;
}): RegisteredTool {
  return {
    definition: {
      name: 'run_team',
      description:
        'Delegate a goal to your team. Team members will work in parallel ' +
        'and you will receive a synthesis of their results to incorporate ' +
        'into your final answer. Use this when the goal benefits from ' +
        'specialised team members working concurrently.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            description: 'The goal or task to delegate to the team',
          },
          teamId: {
            type: 'string',
            description:
              'Team ID to delegate to (optional — defaults to your primary team)',
          },
        },
        required: ['goal'],
      },
    },
    requiresSandbox: false,
    execute: async (input) => {
      const teamId = String(input.teamId ?? '').trim() || opts.defaultTeamId;
      try {
        const result = await opts.teamCoordinator.run(teamId, String(input.goal ?? ''), {
          channelId: opts.channelId,
          peerId: opts.peerId,
        });
        if (!result.success) {
          return { output: `Team run failed: ${result.synthesis}`, isError: true };
        }
        return { output: result.synthesis };
      } catch (err) {
        return { output: `Error running team: ${(err as Error).message}`, isError: true };
      }
    },
  };
}
