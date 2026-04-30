/**
 * AI_DESK — Workspace Tracker
 *
 * In-memory registry of all task and agent activity.
 * Subscribes to eventBus and maintains two live maps:
 *
 *   tasks       — taskId → TaskRecord   (full history, not just running)
 *   agentStates — agentId → AgentActivityRecord
 *   teamRuns    — teamId  → TeamRunRecord
 *
 * The snapshot() method returns everything the dashboard needs.
 * History is capped at MAX_TASKS entries (oldest removed first).
 */
import { eventBus } from '../shared/events.js';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type AgentStatus = 'idle' | 'thinking' | 'tool_use' | 'waiting';
export type TaskPhase = 'decompose' | 'work' | 'synthesize';

export interface TaskRecord {
  taskId: string;
  label: string;
  agentId: string;
  teamId?: string;
  phase: TaskPhase;
  depends: string[];
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  doneAt?: number;
  durationMs?: number;
  error?: string;
  lastStep?: string;
}

export interface AgentActivityRecord {
  agentId: string;
  status: AgentStatus;
  currentTaskId?: string;
  currentTool?: string;
  model?: string;
  updatedAt: number;
}

export interface TeamRunRecord {
  teamId: string;
  teamName?: string;
  goal?: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: number;
  doneAt?: number;
  durationMs?: number;
}

export interface WorkspaceSnapshot {
  tasks: TaskRecord[];
  agents: AgentActivityRecord[];
  teams: TeamRunRecord[];
  updatedAt: number;
}

const MAX_TASKS = 500;

export class WorkspaceTracker {
  private tasks  = new Map<string, TaskRecord>();
  private agents = new Map<string, AgentActivityRecord>();
  private teams  = new Map<string, TeamRunRecord>();
  private updatedAt = Date.now();

  /** onChange is called whenever state changes — used to push WS updates */
  onChange?: () => void;

  constructor() {
    this.subscribe();
  }

  // ─── Public ──────────────────────────────────────────────────────────────────

  snapshot(): WorkspaceSnapshot {
    return {
      tasks:  [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt),
      agents: [...this.agents.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      teams:  [...this.teams.values()].sort((a, b) => b.startedAt - a.startedAt),
      updatedAt: this.updatedAt,
    };
  }

  clear(): void {
    this.tasks.clear();
    this.agents.clear();
    this.teams.clear();
    this.touch();
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private subscribe(): void {
    // Team lifecycle
    eventBus.on('team:start', ({ data }) => {
      const { teamId, teamName, goal } = data as { teamId: string; teamName?: string; goal?: string };
      this.teams.set(teamId, { teamId, teamName, goal, status: 'running', startedAt: Date.now() });
      this.touch();
    });

    eventBus.on('team:complete', ({ data }) => {
      const { teamId, durationMs } = data as { teamId: string; durationMs?: number };
      const run = this.teams.get(teamId);
      if (run) { run.status = 'complete'; run.doneAt = Date.now(); run.durationMs = durationMs; }
      this.touch();
    });

    eventBus.on('team:failed', ({ data }) => {
      const { teamId } = data as { teamId: string };
      const run = this.teams.get(teamId);
      if (run) { run.status = 'failed'; run.doneAt = Date.now(); }
      this.touch();
    });

    // Task lifecycle
    eventBus.on('task:created', ({ data }) => {
      const d = data as { taskId: string; label?: string; agentId: string; teamId?: string; depends?: string[]; phase?: TaskPhase };
      if (this.tasks.size >= MAX_TASKS) {
        // Evict oldest completed task
        const oldest = [...this.tasks.values()]
          .filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'skipped')
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        if (oldest) this.tasks.delete(oldest.taskId);
      }
      this.tasks.set(d.taskId, {
        taskId: d.taskId,
        label: d.label ?? d.taskId,
        agentId: d.agentId,
        teamId: d.teamId,
        phase: d.phase ?? 'work',
        depends: d.depends ?? [],
        status: 'pending',
        createdAt: Date.now(),
      });
      this.touch();
    });

    eventBus.on('task:started', ({ data }) => {
      const { taskId, agentId } = data as { taskId: string; agentId: string };
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'running'; task.startedAt = Date.now(); }
      this.setAgentStatus(agentId, 'thinking', taskId);
      this.touch();
    });

    eventBus.on('task:done', ({ data }) => {
      const { taskId, agentId, durationMs } = data as { taskId: string; agentId: string; durationMs?: number };
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'done'; task.doneAt = Date.now(); task.durationMs = durationMs; }
      this.clearAgentTask(agentId, taskId);
      this.touch();
    });

    eventBus.on('task:failed', ({ data }) => {
      const { taskId, agentId, error, durationMs } = data as { taskId: string; agentId: string; error?: string; durationMs?: number };
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'failed'; task.doneAt = Date.now(); task.durationMs = durationMs; task.error = error; }
      this.clearAgentTask(agentId, taskId);
      this.touch();
    });

    eventBus.on('task:skipped', ({ data }) => {
      const { taskId } = data as { taskId: string };
      const task = this.tasks.get(taskId);
      if (task) { task.status = 'skipped'; task.doneAt = Date.now(); }
      this.touch();
    });

    eventBus.on('task:step', ({ data }) => {
      const { taskId, agentId, step, detail } = data as { taskId: string; agentId: string; step: string; detail?: string };
      const task = this.tasks.get(taskId);
      if (task) task.lastStep = detail ? `${step}:${detail}` : step;
      const agentStatus: AgentStatus = step === 'tool_use' ? 'tool_use' : 'thinking';
      const act = this.agents.get(agentId);
      if (act) {
        act.status = agentStatus;
        act.currentTool = step === 'tool_use' ? detail : undefined;
        act.updatedAt = Date.now();
      } else {
        this.setAgentStatus(agentId, agentStatus, taskId, step === 'tool_use' ? detail : undefined);
      }
      this.touch();
    });

    // Agent lifecycle (from model-router events — not task-specific)
    eventBus.on('agent:start', ({ data }) => {
      const { model } = data as { model?: string };
      // agent:start doesn't include agentId — task:started already handles agent status
      // We use this only to capture the model name via task:step pairing
      void model;
    });

    eventBus.on('agent:end', ({ data }) => {
      const { model } = data as { model?: string; agentId?: string };
      void model;
    });

    // Tool events — enrich agent activity
    eventBus.on('tool:request', ({ data }) => {
      const { tool, agentId } = data as { tool: string; agentId: string };
      const act = this.getOrCreateAgent(agentId);
      act.status = 'tool_use';
      act.currentTool = tool;
      act.updatedAt = Date.now();
      this.touch();
    });

    eventBus.on('tool:result', ({ data }) => {
      const { agentId } = data as { agentId: string };
      const act = this.agents.get(agentId);
      if (act && act.status === 'tool_use') {
        act.status = 'thinking';
        act.currentTool = undefined;
        act.updatedAt = Date.now();
      }
      this.touch();
    });
  }

  private setAgentStatus(agentId: string, status: AgentStatus, taskId?: string, tool?: string): void {
    const act = this.getOrCreateAgent(agentId);
    act.status = status;
    act.currentTaskId = taskId;
    act.currentTool = tool;
    act.updatedAt = Date.now();
  }

  private clearAgentTask(agentId: string, taskId: string): void {
    const act = this.agents.get(agentId);
    if (act && act.currentTaskId === taskId) {
      act.status = 'idle';
      act.currentTaskId = undefined;
      act.currentTool = undefined;
      act.updatedAt = Date.now();
    }
  }

  private getOrCreateAgent(agentId: string): AgentActivityRecord {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, { agentId, status: 'idle', updatedAt: Date.now() });
    }
    return this.agents.get(agentId)!;
  }

  private touch(): void {
    this.updatedAt = Date.now();
    this.onChange?.();
  }
}
