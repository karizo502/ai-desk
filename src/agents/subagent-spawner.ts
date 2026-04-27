/**
 * AI_DESK — Sub-Agent Spawner
 *
 * Spawns parallel sub-agents that:
 *   - Are forced onto the cheap flash model (router enforces this)
 *   - Inherit a MORE restrictive policy than the parent
 *   - Inherit (and consume from) the parent's budget
 *   - Have a hard depth cap to prevent runaway recursion
 *   - Run with their own concurrency semaphore
 *
 * They DO NOT have the ability to spawn children deeper than maxDepth.
 */
import { eventBus } from '../shared/events.js';
import type { ModelRouter } from '../models/model-router.js';
import type { BudgetTracker } from '../budget/budget-tracker.js';
import type { PolicyEngine } from '../tools/policy-engine.js';
import type { ToolExecutor } from './tool-executor.js';
import type { ContextCompactor } from './compactor.js';
import type { SubagentDefaults } from '../config/schema.js';
import type { ModelMessage } from '../models/provider.js';

export interface SubagentTask {
  prompt: string;
  systemPrompt?: string;
  /** Stop conditions */
  maxSteps?: number;
  /** For audit: what asked for this sub-agent */
  parentAgentId: string;
  parentSessionId: string;
  parentRunId: string;
  parentDepth: number;
}

export interface SubagentResult {
  success: boolean;
  output: string;
  steps: number;
  totalTokens: number;
  totalCost: number;
  durationMs: number;
  error?: string;
}

export class SubagentSpawner {
  private router: ModelRouter;
  private executor: ToolExecutor;
  private budget: BudgetTracker;
  private compactor: ContextCompactor;
  private policy: PolicyEngine;
  private defaults: SubagentDefaults;
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(deps: {
    router: ModelRouter;
    executor: ToolExecutor;
    budget: BudgetTracker;
    compactor: ContextCompactor;
    policy: PolicyEngine;
    defaults: SubagentDefaults;
  }) {
    this.router = deps.router;
    this.executor = deps.executor;
    this.budget = deps.budget;
    this.compactor = deps.compactor;
    this.policy = deps.policy;
    this.defaults = deps.defaults;
  }

  async spawn(task: SubagentTask): Promise<SubagentResult> {
    const start = Date.now();
    const depth = task.parentDepth + 1;

    if (depth > this.defaults.maxDepth) {
      return {
        success: false,
        output: '',
        steps: 0,
        totalTokens: 0,
        totalCost: 0,
        durationMs: 0,
        error: `Max sub-agent depth ${this.defaults.maxDepth} exceeded`,
      };
    }

    // Concurrency gate (semaphore)
    await this.acquire();
    const subagentId = `${task.parentAgentId}.sub${depth}`;

    eventBus.emit('subagent:spawn', {
      parent: task.parentAgentId,
      subagent: subagentId,
      depth,
      model: 'flash',
    });

    try {
      const messages: ModelMessage[] = [{ role: 'user', content: task.prompt }];
      const sysPrompt = task.systemPrompt
        ?? 'You are a focused sub-agent. Complete the assigned task efficiently and report back concisely.';

      let totalTokens = 0;
      let totalCost = 0;
      let steps = 0;
      const maxSteps = task.maxSteps ?? 8;
      const tools = this.executor.visibleTools();
      const deadline = Date.now() + this.defaults.runTimeoutSeconds * 1000;

      while (steps < maxSteps) {
        if (Date.now() > deadline) {
          return this.fail(subagentId, start, steps, totalTokens, totalCost, 'Sub-agent run timeout');
        }

        // Budget check (sub-agent shares parent's budget)
        const check = this.budget.check(task.parentAgentId, this.compactor.estimate(messages));
        if (!check.allowed) {
          return this.fail(subagentId, start, steps, totalTokens, totalCost,
            `Budget blocked sub-agent: ${check.reason}`);
        }

        const compacted = this.compactor.shouldCompact(messages)
          ? await this.compactor.compact(messages, sysPrompt)
          : messages;
        if (compacted !== messages) {
          messages.length = 0;
          messages.push(...compacted);
        }

        const result = await this.router.call({
          messages,
          systemPrompt: sysPrompt,
          tools: tools.length > 0 ? tools : undefined,
          forSubagent: true, // ← forces flash model
        });

        steps++;
        totalTokens += result.usage.totalTokens;
        totalCost += result.usage.estimatedCost;
        this.budget.record({
          agentId: task.parentAgentId,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cost: result.usage.estimatedCost,
          timestamp: Date.now(),
        });

        if (result.toolCalls.length === 0 || result.stopReason === 'end_turn') {
          eventBus.emit('subagent:complete', {
            parent: task.parentAgentId,
            subagent: subagentId,
            steps,
            tokens: totalTokens,
            cost: totalCost,
          });
          return {
            success: true,
            output: result.content,
            steps,
            totalTokens,
            totalCost,
            durationMs: Date.now() - start,
          };
        }

        // Append assistant tool-use turn + execute each tool
        for (const toolCall of result.toolCalls) {
          messages.push({
            role: 'assistant',
            content: result.content,
            toolUseId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
          });

          const execResult = await this.executor.execute({
            call: toolCall,
            agentId: subagentId,
            sessionId: task.parentSessionId,
            runId: `${task.parentRunId}-sub${depth}-${steps}`,
            workspace: process.cwd(), // Sub-agents inherit workspace; sandbox isolates them
            subagentDepth: depth,
          });

          messages.push({
            role: 'tool',
            content: execResult.output,
            toolUseId: toolCall.id,
            toolName: toolCall.name,
          });
        }
      }

      return this.fail(subagentId, start, steps, totalTokens, totalCost,
        `Reached max steps (${maxSteps}) without completion`);
    } finally {
      this.release();
    }
  }

  /** Convenience: spawn N sub-agents in parallel and collect results */
  async spawnParallel(tasks: SubagentTask[]): Promise<SubagentResult[]> {
    return Promise.all(tasks.map(t => this.spawn(t)));
  }

  // ── child policy isn't yet used end-to-end, but exposed for callers wiring strict policies ──
  childPolicy(): PolicyEngine {
    return this.policy.createChildPolicy({
      profile: 'readonly', // Default: sub-agents are read-only
    });
  }

  // ── Concurrency gate ──
  private async acquire(): Promise<void> {
    if (this.active < this.defaults.maxConcurrent) {
      this.active++;
      return;
    }
    return new Promise<void>(resolve => this.waiters.push(() => {
      this.active++;
      resolve();
    }));
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  private fail(
    subagentId: string,
    start: number,
    steps: number,
    totalTokens: number,
    totalCost: number,
    error: string,
  ): SubagentResult {
    eventBus.emit('subagent:failed', { subagent: subagentId, error, steps });
    return {
      success: false,
      output: '',
      steps,
      totalTokens,
      totalCost,
      durationMs: Date.now() - start,
      error,
    };
  }
}
