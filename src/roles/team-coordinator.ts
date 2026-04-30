/**
 * AI_DESK — Team Coordinator
 *
 * Runs a team against a goal in three phases:
 *   1. Lead agent decomposes the goal into a JSON task list
 *   2. Orchestrator executes tasks (may be parallel)
 *   3. Lead agent synthesises all results into a final answer
 */
import type { AgentRuntime } from '../agents/agent-runtime.js';
import { Orchestrator } from '../orchestration/orchestrator.js';
import type { TaskDefinition } from '../orchestration/task-graph.js';
import { eventBus } from '../shared/events.js';
import type { RoleDefinition, TeamDefinition, TeamRunResult } from './role.js';

export class TeamCoordinator {
  private runtime: AgentRuntime;
  private orchestrator: Orchestrator;
  private roles: Map<string, RoleDefinition>;
  private teams: Map<string, TeamDefinition>;

  constructor(opts: {
    runtime: AgentRuntime;
    roles: RoleDefinition[];
    teams: TeamDefinition[];
  }) {
    this.runtime = opts.runtime;
    this.orchestrator = new Orchestrator(opts.runtime);
    this.roles = new Map(opts.roles.map(r => [r.id, r]));
    this.teams = new Map(opts.teams.map(t => [t.id, t]));
  }

  listTeams(): TeamDefinition[] {
    return [...this.teams.values()];
  }

  listRoles(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  async run(teamId: string, goal: string): Promise<TeamRunResult> {
    const start = Date.now();
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);

    eventBus.emit('team:start', { teamId, teamName: team.name, goal });

    // ── Synthetic task: decompose ─────────────────────────────
    eventBus.emit('task:created', {
      taskId: `${teamId}:__decompose__`,
      label: 'Decompose goal',
      agentId: team.leadAgentId,
      teamId,
      depends: [],
      phase: 'decompose',
    });
    eventBus.emit('task:started', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId });

    // ── Phase 1: decompose goal into tasks ───────────────────
    const memberContext = team.members.map(m => {
      const role = this.roles.get(m.roleId);
      return `  - Agent "${m.agentId}" with role "${role?.name ?? m.roleId}": ${role?.description ?? '(no description)'}`;
    }).join('\n');

    const sharedGoalNote = team.sharedGoal
      ? `\n\nStanding team context: ${team.sharedGoal}`
      : '';

    const decompositionPrompt =
      `You are the lead coordinator of team "${team.name}".${sharedGoalNote}\n\n` +
      `Your team members:\n${memberContext}\n\n` +
      `Goal: ${goal}\n\n` +
      `Break this goal into concrete tasks for your team members. ` +
      `Reply with ONLY a valid JSON array (no markdown fences, no explanation) matching this schema:\n` +
      `[{ "id": "t1", "agentId": "<agentId>", "prompt": "<task prompt>", "label": "<short label>", "depends": [] }]\n` +
      `Use "depends" to express task ordering (array of id strings). ` +
      `Keep prompts self-contained so agents don't need extra context.`;

    const decompositionResult = await this.runtime.run({
      userMessage: decompositionPrompt,
      agentId: team.leadAgentId,
      channelId: `team:${teamId}`,
      peerId: 'coordinator',
    });

    if (!decompositionResult.success) {
      const err = `Lead agent failed during decomposition: ${decompositionResult.error}`;
      eventBus.emit('task:failed', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
        error: decompositionResult.error, durationMs: decompositionResult.durationMs });
      eventBus.emit('team:failed', { teamId, error: err });
      return {
        teamId,
        teamName: team.name,
        goal,
        success: false,
        synthesis: err,
        taskCount: 0,
        doneCount: 0,
        failedCount: 0,
        totalDurationMs: Date.now() - start,
      };
    }

    // Parse the JSON task list
    let tasks: TaskDefinition[];
    try {
      const cleaned = decompositionResult.content.trim().replace(/^```json\n?|^```\n?|\n?```$/g, '');
      tasks = JSON.parse(cleaned) as TaskDefinition[];
      if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('empty task array');
    } catch (err) {
      const errMsg = `Lead agent returned invalid task JSON: ${(err as Error).message}`;
      eventBus.emit('task:failed', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
        error: errMsg });
      eventBus.emit('team:failed', { teamId, error: errMsg });
      return {
        teamId,
        teamName: team.name,
        goal,
        success: false,
        synthesis: errMsg,
        taskCount: 0,
        doneCount: 0,
        failedCount: 0,
        totalDurationMs: Date.now() - start,
      };
    }

    // Decomposition succeeded
    eventBus.emit('task:done', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
      durationMs: decompositionResult.durationMs });

    // Announce the discovered tasks so WorkspaceTracker can pre-populate them
    for (const task of tasks) {
      eventBus.emit('task:created', {
        taskId: task.id,
        label: task.label ?? task.id,
        agentId: task.agentId,
        teamId,
        depends: task.depends ?? [],
        phase: 'work',
      });
    }

    // Apply role system-prompt prefixes: inject into each task's prompt
    tasks = tasks.map(task => {
      const member = team.members.find(m => m.agentId === task.agentId);
      if (!member) return task;
      const role = this.roles.get(member.roleId);
      if (!role?.systemPromptPrefix) return task;
      return { ...task, prompt: `${role.systemPromptPrefix}\n\n${task.prompt}` };
    });

    // ── Phase 2: execute the task graph ──────────────────────
    const orchResult = await this.orchestrator.run({
      tasks,
      maxConcurrent: 4,
      failFast: false,
      channelId: `team:${teamId}`,
      peerId: 'coordinator',
      teamId,
    });

    // ── Phase 3: synthesise results ──────────────────────────
    eventBus.emit('task:created', {
      taskId: `${teamId}:__synthesize__`,
      label: 'Synthesise results',
      agentId: team.leadAgentId,
      teamId,
      depends: orchResult.tasks.map(t => t.id),
      phase: 'synthesize',
    });
    eventBus.emit('task:started', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId });
    const resultLines = orchResult.tasks.map(t => {
      if (t.status === 'done') return `[${t.label ?? t.id}] DONE:\n${t.result}`;
      if (t.status === 'failed') return `[${t.label ?? t.id}] FAILED: ${t.error}`;
      return `[${t.label ?? t.id}] SKIPPED`;
    }).join('\n\n---\n\n');

    const synthesisPrompt =
      `You coordinated team "${team.name}" on goal: ${goal}\n\n` +
      `Here are the results from your team:\n\n${resultLines}\n\n` +
      `Synthesise these results into a cohesive final answer for the user. ` +
      `Be concise. If there were failures, acknowledge them and explain the impact.`;

    const synthesisResult = await this.runtime.run({
      userMessage: synthesisPrompt,
      agentId: team.leadAgentId,
      channelId: `team:${teamId}`,
      peerId: 'coordinator',
      onProgress: (event) => {
        eventBus.emit('task:step', {
          taskId: `${teamId}:__synthesize__`,
          agentId: team.leadAgentId,
          teamId,
          step: event.type,
          detail: event.type === 'tool_use' ? (event as { toolName: string }).toolName : undefined,
        });
      },
    });

    if (synthesisResult.success) {
      eventBus.emit('task:done', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId,
        durationMs: synthesisResult.durationMs });
    } else {
      eventBus.emit('task:failed', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId,
        error: synthesisResult.error, durationMs: synthesisResult.durationMs });
    }

    const synthesis = synthesisResult.success
      ? synthesisResult.content
      : `Synthesis failed: ${synthesisResult.error}\n\nRaw results:\n${resultLines}`;

    const result: TeamRunResult = {
      teamId,
      teamName: team.name,
      goal,
      success: orchResult.success,
      synthesis,
      taskCount: orchResult.taskCount,
      doneCount: orchResult.doneCount,
      failedCount: orchResult.failedCount,
      totalDurationMs: Date.now() - start,
    };

    eventBus.emit('team:complete', {
      teamId,
      teamName: team.name,
      success: result.success,
      durationMs: result.totalDurationMs,
    });

    return result;
  }
}
