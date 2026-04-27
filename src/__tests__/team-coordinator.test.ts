import { describe, it, expect, vi, type MockedFunction } from 'vitest';
import { TeamCoordinator } from '../roles/team-coordinator.js';
import type { AgentRuntime } from '../agents/agent-runtime.js';
import type { AgentRunResult } from '../agents/agent-runtime.js';

// ── Helpers ──────────────────────────────────────────────────

function mockRuntime(responses: Array<Partial<AgentRunResult>>): AgentRuntime {
  let callIndex = 0;
  const run = vi.fn(async (): Promise<AgentRunResult> => {
    const r = responses[callIndex % responses.length];
    callIndex++;
    return {
      success: true,
      content: '',
      sessionId: 'sess',
      agentId: 'main',
      steps: 1,
      cached: false,
      model: 'claude-sonnet-4-6',
      tokensUsed: { input: 10, output: 20, total: 30, cost: 0 },
      durationMs: 1,
      ...r,
    };
  }) as MockedFunction<AgentRuntime['run']>;

  return { run, activeRunCount: () => 0 } as unknown as AgentRuntime;
}

const ROLES = [
  { id: 'exec', name: 'Executor', description: 'Does the work' },
];

const TEAM = {
  id: 'team1',
  name: 'Test Team',
  leadAgentId: 'main',
  members: [{ agentId: 'worker', roleId: 'exec' }],
};

const validTaskJson = JSON.stringify([
  { id: 't1', agentId: 'worker', prompt: 'do the thing', label: 'Task 1', depends: [] },
]);

// ── Tests ────────────────────────────────────────────────────

describe('TeamCoordinator.run()', () => {
  it('throws when team id is not found', async () => {
    const coordinator = new TeamCoordinator({
      runtime: mockRuntime([{ content: '[]' }]),
      roles: ROLES,
      teams: [TEAM],
    });
    await expect(coordinator.run('ghost-team', 'goal')).rejects.toThrow(/not found/i);
  });

  it('returns failure when the lead agent fails during decomposition', async () => {
    const runtime = mockRuntime([
      { success: false, content: '', error: 'model unavailable' },
    ]);
    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    const result = await coordinator.run('team1', 'my goal');
    expect(result.success).toBe(false);
    expect(result.synthesis).toMatch(/decomposition/i);
  });

  it('returns failure when the lead agent returns invalid JSON', async () => {
    const runtime = mockRuntime([
      { success: true, content: 'not valid json at all' },
    ]);
    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    const result = await coordinator.run('team1', 'my goal');
    expect(result.success).toBe(false);
    expect(result.synthesis).toMatch(/invalid task json/i);
  });

  it('returns failure when the lead agent returns an empty task array', async () => {
    const runtime = mockRuntime([
      { success: true, content: '[]' },
    ]);
    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    const result = await coordinator.run('team1', 'my goal');
    expect(result.success).toBe(false);
  });

  it('calls runtime.run at least 3 times: decompose, worker task, synthesise', async () => {
    const runtime = mockRuntime([
      { success: true, content: validTaskJson },   // decomposition
      { success: true, content: 'task done' },     // worker task
      { success: true, content: 'final synthesis' }, // synthesis
    ]);
    const runSpy = runtime.run as MockedFunction<AgentRuntime['run']>;

    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    await coordinator.run('team1', 'accomplish something');

    expect(runSpy).toHaveBeenCalledTimes(3);
  });

  it('returns the synthesis from the lead agent as the final content', async () => {
    const runtime = mockRuntime([
      { success: true, content: validTaskJson },
      { success: true, content: 'worker output' },
      { success: true, content: 'synthesised answer' },
    ]);
    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    const result = await coordinator.run('team1', 'goal');
    expect(result.synthesis).toBe('synthesised answer');
    expect(result.taskCount).toBe(1);
    expect(result.doneCount).toBe(1);
  });

  it('strips markdown code fences from the task JSON response', async () => {
    const fencedJson = '```json\n' + validTaskJson + '\n```';
    const runtime = mockRuntime([
      { success: true, content: fencedJson },
      { success: true, content: 'done' },
      { success: true, content: 'summary' },
    ]);
    const coordinator = new TeamCoordinator({ runtime, roles: ROLES, teams: [TEAM] });
    const result = await coordinator.run('team1', 'goal');
    expect(result.success).toBe(true);
  });

  it('listTeams returns configured teams', () => {
    const coordinator = new TeamCoordinator({
      runtime: mockRuntime([]),
      roles: ROLES,
      teams: [TEAM],
    });
    expect(coordinator.listTeams()).toHaveLength(1);
    expect(coordinator.listTeams()[0].id).toBe('team1');
  });

  it('listRoles returns configured roles', () => {
    const coordinator = new TeamCoordinator({
      runtime: mockRuntime([]),
      roles: ROLES,
      teams: [TEAM],
    });
    expect(coordinator.listRoles()).toHaveLength(1);
    expect(coordinator.listRoles()[0].id).toBe('exec');
  });
});
