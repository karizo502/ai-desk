/**
 * AI_DESK — Multi-Agent Orchestrator
 *
 * Executes a TaskGraph by:
 *   1. Finding all tasks with satisfied dependencies (ready tasks)
 *   2. Running them in parallel via AgentRuntime
 *   3. Recording results and unblocking downstream tasks
 *   4. Repeating until complete or a terminal failure occurs
 *
 * Each task runs as a sub-agent call on the target agentId.
 * maxConcurrent controls the parallel fan-out width.
 */
import { TaskGraph, type TaskDefinition, type TaskNode } from './task-graph.js';
import type { AgentRuntime } from '../agents/agent-runtime.js';
import { eventBus } from '../shared/events.js';

export interface OrchestrateRequest {
  tasks: TaskDefinition[];
  /** Max tasks running simultaneously (default: 5) */
  maxConcurrent?: number;
  /** If true, stop all tasks when the first failure occurs */
  failFast?: boolean;
  channelId?: string;
  peerId?: string;
  /** Team that spawned this orchestration — forwarded in task:* events */
  teamId?: string;
  /** Pre-seeded results for already-done tasks (resume flow) */
  completedResults?: Record<string, string>;
  /** Called whenever an agent writes a file — used for artifact tracking */
  onFileWrite?: (event: { relativePath: string; bytes: number }) => void;
}

export interface OrchestrateResult {
  success: boolean;
  taskCount: number;
  doneCount: number;
  failedCount: number;
  skippedCount: number;
  totalDurationMs: number;
  summary: string;
  tasks: Array<{
    id: string;
    label?: string;
    status: string;
    result?: string;
    error?: string;
    durationMs?: number;
  }>;
}

export class Orchestrator {
  private runtime: AgentRuntime;

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  async run(req: OrchestrateRequest): Promise<OrchestrateResult> {
    const start = Date.now();
    const graph = new TaskGraph(req.tasks, req.completedResults);
    const maxConcurrent = req.maxConcurrent ?? 5;
    const failFast = req.failFast ?? false;
    const running = new Set<string>();

    eventBus.emit('orchestrator:start', { taskCount: req.tasks.length });

    // Keep ticking until the graph is complete or we hit failFast
    while (!graph.isComplete()) {
      if (failFast && graph.hasFailed()) break;

      const ready = graph.readyTasks().filter(n => !running.has(n.def.id));
      const slots = maxConcurrent - running.size;
      const toStart = ready.slice(0, slots);

      if (toStart.length === 0 && running.size === 0) {
        // Deadlock — shouldn't happen if the graph is valid, but protect anyway
        break;
      }

      // Launch ready tasks in parallel
      await Promise.all(toStart.map(node => this.startTask(node, graph, running, req)));
    }

    const nodes = [...graph.allNodes().values()];
    const taskCount = nodes.length;
    const doneCount = nodes.filter(n => n.status === 'done').length;
    const failedCount = nodes.filter(n => n.status === 'failed').length;
    const skippedCount = nodes.filter(n => n.status === 'skipped').length;

    const result: OrchestrateResult = {
      success: failedCount === 0 && skippedCount === 0,
      taskCount,
      doneCount,
      failedCount,
      skippedCount,
      totalDurationMs: Date.now() - start,
      summary: graph.summarise(),
      tasks: nodes.map(n => ({
        id: n.def.id,
        label: n.def.label,
        status: n.status,
        result: n.result,
        error: n.error,
        durationMs: n.durationMs,
      })),
    };

    eventBus.emit('orchestrator:complete', {
      success: result.success,
      doneCount,
      failedCount,
      durationMs: result.totalDurationMs,
    });

    return result;
  }

  private async startTask(
    node: TaskNode,
    graph: TaskGraph,
    running: Set<string>,
    req: OrchestrateRequest,
  ): Promise<void> {
    const { id, agentId, label } = node.def;
    const teamId = req.teamId;
    running.add(id);
    graph.markRunning(id);

    eventBus.emit('orchestrator:task-start', { id, agentId });
    eventBus.emit('task:started', { taskId: id, agentId, teamId, label });

    // Run the task and wait — the caller awaits Promise.all over these
    try {
      const prompt = graph.resolvePrompt(id);
      const result = await this.runtime.run({
        userMessage: prompt,
        agentId,
        channelId: req.channelId ?? 'orchestrator',
        peerId: req.peerId ?? 'orchestrator',
        onProgress: (event) => {
          eventBus.emit('task:step', { taskId: id, agentId, teamId, label, step: event.type,
            detail: event.type === 'tool_use' ? (event as { toolName: string }).toolName : undefined });
        },
        onFileWrite: req.onFileWrite
          ? (e) => req.onFileWrite!({ relativePath: e.relativePath, bytes: e.bytes })
          : undefined,
      });

      if (result.success) {
        graph.markDone(id, result.content);
        eventBus.emit('orchestrator:task-done', { id, durationMs: result.durationMs });
        eventBus.emit('task:done', { taskId: id, agentId, teamId, label, durationMs: result.durationMs, result: result.content });
      } else {
        graph.markFailed(id, result.error ?? 'agent returned failure');
        eventBus.emit('orchestrator:task-failed', { id, error: result.error });
        eventBus.emit('task:failed', { taskId: id, agentId, teamId, label, error: result.error,
          durationMs: result.durationMs });
      }
    } catch (err) {
      const error = (err as Error).message;
      graph.markFailed(id, error);
      eventBus.emit('orchestrator:task-failed', { id, error });
      eventBus.emit('task:failed', { taskId: id, agentId, teamId, label, error });
    } finally {
      running.delete(id);
    }
  }
}
