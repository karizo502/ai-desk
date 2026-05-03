/**
 * AI_DESK — Task Graph
 *
 * A directed acyclic graph (DAG) of tasks for multi-agent orchestration.
 * Tasks declare dependencies; the orchestrator runs them in topological order,
 * injecting results from dependencies into each task's prompt.
 *
 * Result injection syntax: reference another task's output in a prompt with
 *   {{results.task_id}}
 * The orchestrator replaces those tokens before dispatching to an agent.
 */
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface TaskDefinition {
  /** Unique ID within this graph */
  id: string;
  /** Agent to run this task on */
  agentId: string;
  /** Prompt template — may reference {{results.<id>}} from dependencies */
  prompt: string;
  /** IDs of tasks that must complete before this one starts */
  depends?: string[];
  /** Optional label for display */
  label?: string;
}

export interface TaskNode {
  def: TaskDefinition;
  status: TaskStatus;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export class TaskGraph {
  private nodes = new Map<string, TaskNode>();

  constructor(
    tasks: TaskDefinition[],
    /** Pre-seed results for already-completed tasks (used when resuming a run) */
    completedResults?: Record<string, string>,
  ) {
    for (const def of tasks) {
      const preResult = completedResults?.[def.id];
      if (preResult !== undefined) {
        // Mark as already done so dependents can proceed immediately
        const now = Date.now();
        this.nodes.set(def.id, { def, status: 'done', result: preResult, startedAt: now, completedAt: now, durationMs: 0 });
      } else {
        this.nodes.set(def.id, { def, status: 'pending' });
      }
    }
    this.validate();
  }

  /** Tasks with no unfinished dependencies (ready to run right now) */
  readyTasks(): TaskNode[] {
    return [...this.nodes.values()].filter(node => {
      if (node.status !== 'pending') return false;
      const deps = node.def.depends ?? [];
      return deps.every(depId => this.nodes.get(depId)?.status === 'done');
    });
  }

  /** True when all tasks are in a terminal state */
  isComplete(): boolean {
    return [...this.nodes.values()].every(n =>
      n.status === 'done' || n.status === 'failed' || n.status === 'skipped'
    );
  }

  /** True if any non-skipped task failed */
  hasFailed(): boolean {
    return [...this.nodes.values()].some(n => n.status === 'failed');
  }

  markRunning(id: string): void {
    const node = this.get(id);
    node.status = 'running';
    node.startedAt = Date.now();
  }

  markDone(id: string, result: string): void {
    const node = this.get(id);
    node.status = 'done';
    node.result = result;
    node.completedAt = Date.now();
    node.durationMs = node.startedAt ? node.completedAt - node.startedAt : 0;
    // If a dependency failed, skip dependents
    this.skipDependentsOfFailed();
  }

  markFailed(id: string, error: string): void {
    const node = this.get(id);
    node.status = 'failed';
    node.error = error;
    node.completedAt = Date.now();
    node.durationMs = node.startedAt ? node.completedAt - node.startedAt : 0;
    this.skipDependentsOfFailed();
  }

  /**
   * Resolve a task's prompt by substituting {{results.<id>}} placeholders
   * with completed dependency results.
   */
  resolvePrompt(id: string): string {
    const node = this.get(id);
    let prompt = node.def.prompt;
    for (const [depId, depNode] of this.nodes) {
      if (depNode.status === 'done' && depNode.result !== undefined) {
        prompt = prompt.replaceAll(`{{results.${depId}}}`, depNode.result);
      }
    }
    return prompt;
  }

  /** All results as a summary string */
  summarise(): string {
    const lines: string[] = [];
    for (const [id, node] of this.nodes) {
      const label = node.def.label ?? id;
      const dur = node.durationMs != null ? ` (${(node.durationMs / 1000).toFixed(1)}s)` : '';
      if (node.status === 'done') {
        lines.push(`✓ ${label}${dur}: ${(node.result ?? '').slice(0, 200)}`);
      } else if (node.status === 'failed') {
        lines.push(`✗ ${label}${dur}: ${node.error}`);
      } else if (node.status === 'skipped') {
        lines.push(`- ${label}: skipped (dependency failed)`);
      }
    }
    return lines.join('\n');
  }

  allNodes(): Map<string, TaskNode> {
    return this.nodes;
  }

  private get(id: string): TaskNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Task "${id}" not found in graph`);
    return node;
  }

  private skipDependentsOfFailed(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of this.nodes.values()) {
        if (node.status !== 'pending') continue;
        const hasBrokenDep = (node.def.depends ?? []).some(depId => {
          const dep = this.nodes.get(depId);
          return dep?.status === 'failed' || dep?.status === 'skipped';
        });
        if (hasBrokenDep) {
          node.status = 'skipped';
          changed = true;
        }
      }
    }
  }

  private validate(): void {
    // Cycle detection via DFS
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string): void => {
      if (stack.has(id)) throw new Error(`Cycle detected in task graph at task "${id}"`);
      if (visited.has(id)) return;
      stack.add(id);
      for (const dep of this.nodes.get(id)?.def.depends ?? []) {
        if (!this.nodes.has(dep)) throw new Error(`Task "${id}" depends on unknown task "${dep}"`);
        dfs(dep);
      }
      stack.delete(id);
      visited.add(id);
    };

    for (const id of this.nodes.keys()) dfs(id);
  }
}
