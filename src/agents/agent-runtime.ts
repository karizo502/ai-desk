/**
 * AI_DESK — Agent Runtime
 *
 * The main agent loop that replaces Phase 1's echo handler.
 * Wires together: router, cache, budget, compactor, tools, sandbox, sessions.
 *
 * Loop:
 *   1. Threat-scan user input → drop or sanitise
 *   2. Build transcript from session
 *   3. Compact if approaching context limit
 *   4. Budget check → block / pause / proceed
 *   5. Cache lookup → return cached if hit
 *   6. Model call (with failover) via router
 *   7. If tool calls returned: execute each via tool-executor (with approval flow)
 *   8. Loop until end_turn or step cap
 *   9. Persist transcript, record budget usage, emit metrics
 */
import { eventBus } from '../shared/events.js';
import { v4 as uuid } from 'uuid';
import type { ModelRouter } from '../models/model-router.js';
import type { ResponseCache } from '../cache/response-cache.js';
import type { BudgetTracker } from '../budget/budget-tracker.js';
import type { ContextCompactor } from './compactor.js';
import type { ToolExecutor } from './tool-executor.js';
import type { SubagentSpawner } from './subagent-spawner.js';
import type { SessionStore } from '../sessions/session-store.js';
import type { ThreatDetector } from '../security/threat-detector.js';
import type { ModelMessage } from '../models/provider.js';
import type { AgentConfig, AgentDefaultsSchema } from '../config/schema.js';
import type { Static } from '@sinclair/typebox';
import type { MemoryStore } from '../memory/memory-store.js';

type AgentDefaults = Static<typeof AgentDefaultsSchema>;

export interface AgentRunRequest {
  userMessage: string;
  agentId: string;
  channelId: string;
  peerId: string;
  /** Streaming callback — chunks pushed as they're produced */
  onProgress?: (event: AgentProgressEvent) => void;
  /** Override max steps for this run */
  maxSteps?: number;
  /**
   * Per-run approval requester — overrides the gateway's WebSocket-based default.
   * Used by the Telegram adapter to route approval requests as inline-keyboard messages.
   */
  requestApproval?: import('./tool-executor.js').ApprovalRequester;
  /**
   * Extra tools injected for this specific run only — bypass policy/approval/sandbox.
   * Used by the gateway to inject run_team for lead agents in autonomous mode.
   */
  extraTools?: import('./tool-registry.js').RegisteredTool[];
}

export type AgentProgressEvent =
  | { type: 'thinking' }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; durationMs: number; isError: boolean }
  | { type: 'compaction'; messagesBefore: number; messagesAfter: number }
  | { type: 'cache_hit'; tokensSaved: number }
  | { type: 'budget_warning'; period: string; pctUsed: number };

export interface AgentRunResult {
  success: boolean;
  content: string;
  sessionId: string;
  agentId: string;
  steps: number;
  cached: boolean;
  model: string;
  tokensUsed: { input: number; output: number; total: number; cost: number };
  durationMs: number;
  error?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are AI_DESK, a security-first AI assistant running in a sandboxed gateway. ' +
  'Be concise. Use tools when needed; do not invent information. ' +
  'If a tool is denied, explain that the user must approve it via the AI_DESK approval flow.';

export class AgentRuntime {
  private router: ModelRouter;
  private cache: ResponseCache;
  private budget: BudgetTracker;
  private compactor: ContextCompactor;
  private executor: ToolExecutor;
  private subagents: SubagentSpawner;
  private sessions: SessionStore;
  private threat: ThreatDetector;
  private defaults: AgentDefaults;
  private agents: Map<string, AgentConfig>;
  private systemPromptProvider: ((agentId: string) => string) | null = null;
  private memoryStore: MemoryStore | null = null;
  /** agentId → number of concurrently running calls */
  private activeRuns = new Map<string, number>();

  constructor(deps: {
    router: ModelRouter;
    cache: ResponseCache;
    budget: BudgetTracker;
    compactor: ContextCompactor;
    executor: ToolExecutor;
    subagents: SubagentSpawner;
    sessions: SessionStore;
    threat: ThreatDetector;
    defaults: AgentDefaults;
    agents: AgentConfig[];
    systemPromptProvider?: (agentId: string) => string;
    memoryStore?: MemoryStore;
  }) {
    this.router = deps.router;
    this.cache = deps.cache;
    this.budget = deps.budget;
    this.compactor = deps.compactor;
    this.executor = deps.executor;
    this.subagents = deps.subagents;
    this.sessions = deps.sessions;
    this.threat = deps.threat;
    this.defaults = deps.defaults;
    this.agents = new Map(deps.agents.map(a => [a.id, a]));
    this.systemPromptProvider = deps.systemPromptProvider ?? null;
    this.memoryStore = deps.memoryStore ?? null;
  }

  /** Update the system prompt provider (called after skill enable/disable) */
  setSystemPromptProvider(provider: (agentId: string) => string): void {
    this.systemPromptProvider = provider;
  }

  /**
   * Hot-reload agents list and defaults from the dashboard config editor.
   * Safe to call while the gateway is running — only affects new requests;
   * in-flight runs continue using the config they started with.
   */
  reloadAgents(agents: AgentConfig[], defaults: AgentDefaults): void {
    this.defaults = defaults;
    this.agents   = new Map(agents.map(a => [a.id, a]));
  }

  /** Returns how many concurrent runs are active for a given agentId */
  activeRunCount(agentId: string): number {
    return this.activeRuns.get(agentId) ?? 0;
  }

  /** Returns the agent config for the given id, or undefined if not found */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    const start = Date.now();
    const runId = uuid();
    const agentCfg = this.agents.get(req.agentId);
    if (!agentCfg) {
      return this.fail(req, runId, start, `Unknown agent: ${req.agentId}`);
    }

    // Track active run
    this.activeRuns.set(req.agentId, (this.activeRuns.get(req.agentId) ?? 0) + 1);

    try {
    // 1. Threat scan
    const scan = this.threat.scan(req.userMessage);
    if (!scan.safe) {
      eventBus.emit('security:threat', {
        agentId: req.agentId,
        score: scan.score,
        action: 'blocked',
      });
      return this.fail(req, runId, start,
        `Message blocked by security policy (score=${scan.score.toFixed(2)})`);
    }

    // 2. Session
    const session = this.sessions.create(req.agentId, req.channelId, req.peerId);
    const transcript = (session.transcript as ModelMessage[]) ?? [];
    transcript.push({ role: 'user', content: req.userMessage });

    // 3. Inject long-term memories (before compaction so they're in context)
    let working = transcript;
    if (this.memoryStore) {
      working = await this.compactor.buildMemoryContext(working, req.agentId, req.userMessage);
    }

    // 4. Compact if needed
    if (this.compactor.shouldCompact(working)) {
      const before = working.length;
      working = await this.compactor.compact(working, undefined, req.agentId, session.id);
      req.onProgress?.({ type: 'compaction', messagesBefore: before, messagesAfter: working.length });
    }

    // Tools available based on policy + per-run extras (e.g. run_team)
    const tools = this.executor.visibleToolsWithExtra(req.extraTools);
    const extraToolMap = req.extraTools?.length
      ? new Map(req.extraTools.map(t => [t.definition.name, t]))
      : null;
    const basePrompt = this.systemPromptProvider ? this.systemPromptProvider(req.agentId) : DEFAULT_SYSTEM_PROMPT;
    const sysPrompt = agentCfg.personality ? agentCfg.personality + '\n\n' + basePrompt : basePrompt;

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let modelUsed = '';
    let cached = false;
    const maxSteps = req.maxSteps ?? 10;
    const deadline = Date.now() + this.defaults.timeoutSeconds * 1000;
    const workspace = expandWorkspace(agentCfg.workspace);

    let lastAssistantContent = '';
    let steps = 0;

    try {
      while (steps < maxSteps) {
        if (Date.now() > deadline) {
          throw new Error(`Run timeout (${this.defaults.timeoutSeconds}s)`);
        }

        // 4. Budget check
        const estimate = this.compactor.estimate(working);
        const budgetCheck = this.budget.check(req.agentId, estimate);
        if (!budgetCheck.allowed) {
          throw new Error(budgetCheck.reason ?? 'Budget exceeded');
        }
        if (budgetCheck.warning) {
          req.onProgress?.({
            type: 'budget_warning',
            period: budgetCheck.daily.pctUsed >= budgetCheck.monthly.pctUsed ? 'daily' : 'monthly',
            pctUsed: Math.max(budgetCheck.daily.pctUsed, budgetCheck.monthly.pctUsed),
          });
        }

        const callOpts = {
          model: '', // overridden by router
          messages: working,
          systemPrompt: sysPrompt,
          tools: tools.length > 0 ? tools : undefined,
          maxTokens: 4096,
          temperature: 0.7,
        };

        // 5. Cache lookup — use the same model key for get and set (Bug 2 fix)
        const requestedModel = this.router.pickModel({ preferredModel: agentCfg.model?.primary });
        const cachedResult = this.cache.get({ ...callOpts, model: requestedModel });

        let result;
        if (cachedResult) {
          cached = true;
          result = cachedResult;
          req.onProgress?.({ type: 'cache_hit', tokensSaved: cachedResult.usage.totalTokens });
        } else {
          req.onProgress?.({ type: 'thinking' });

          // 6. Model call
          result = await this.router.call({
            messages: working,
            systemPrompt: sysPrompt,
            tools: tools.length > 0 ? tools : undefined,
            maxTokens: 4096,
            temperature: 0.7,
            preferredModel: agentCfg.model?.primary,
          });

          // Cache keyed on requested model name (not result.model full version string)
          this.cache.set({ ...callOpts, model: requestedModel }, result);
          this.budget.record({
            agentId: req.agentId,
            model: result.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cost: result.usage.estimatedCost,
            timestamp: Date.now(),
          });
        }

        steps++;
        totalInput += result.usage.inputTokens;
        totalOutput += result.usage.outputTokens;
        totalCost += result.usage.estimatedCost;
        modelUsed = result.model;
        lastAssistantContent = result.content;

        if (result.toolCalls.length === 0 || result.stopReason === 'end_turn') {
          working.push({ role: 'assistant', content: result.content });
          break;
        }

        // 7. Tool calls — Bug 1 fix: push ALL assistant tool-use slots first, then
        // execute and push ALL results. This produces the correct sequence:
        //   assistant(tool1), assistant(tool2), ..., tool(result1), tool(result2), ...
        // which toAnthropicMessages / toGeminiContents merges into one assistant message
        // + one user message as the API requires.
        for (const toolCall of result.toolCalls) {
          working.push({
            role: 'assistant',
            content: result.content,
            toolUseId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
          });
          req.onProgress?.({ type: 'tool_use', toolName: toolCall.name, input: toolCall.input });
        }

        for (const toolCall of result.toolCalls) {
          const toolStart = Date.now();
          const extraTool = extraToolMap?.get(toolCall.name);

          let toolOutput: string;
          let toolIsError: boolean;

          if (extraTool) {
            // Extra tools (e.g. run_team) bypass policy/approval/sandbox — trusted internal ops.
            try {
              const r = await extraTool.execute(
                toolCall.input as Record<string, unknown>,
                {
                  workspace,
                  sessionId: session.id,
                  agentId: req.agentId,
                  runId,
                  sandbox: this.executor.getSandbox(),
                },
              );
              toolOutput = r.output;
              toolIsError = r.isError ?? false;
            } catch (err) {
              toolOutput = `Error: ${(err as Error).message}`;
              toolIsError = true;
            }
            req.onProgress?.({
              type: 'tool_result',
              toolName: toolCall.name,
              durationMs: Date.now() - toolStart,
              isError: toolIsError,
            });
          } else {
            const execResult = await this.executor.execute({
              call: toolCall,
              agentId: req.agentId,
              sessionId: session.id,
              runId,
              workspace,
              subagentDepth: 0,
              requestApproval: req.requestApproval,
            });
            toolOutput = execResult.output;
            toolIsError = execResult.isError;
            req.onProgress?.({
              type: 'tool_result',
              toolName: toolCall.name,
              durationMs: execResult.durationMs,
              isError: execResult.isError,
            });
          }

          working.push({
            role: 'tool',
            content: toolOutput,
            toolUseId: toolCall.id,
            toolName: toolCall.name,
          });
        }
      }

      // 8. Persist
      this.sessions.update(session.id, { transcript: working });

      // If the agent ran steps but produced no text content, it likely got stuck
      // in a tool-call loop and never returned a usable text response.
      if (steps > 0 && !lastAssistantContent.trim()) {
        return {
          success: false,
          content: '',
          sessionId: session.id,
          agentId: req.agentId,
          steps,
          cached,
          model: modelUsed,
          tokensUsed: {
            input: totalInput,
            output: totalOutput,
            total: totalInput + totalOutput,
            cost: totalCost,
          },
          durationMs: Date.now() - start,
          error: `Agent completed ${steps} step(s) without producing a text response (likely stuck in tool-call loop)`,
        };
      }

      return {
        success: true,
        content: lastAssistantContent,
        sessionId: session.id,
        agentId: req.agentId,
        steps,
        cached,
        model: modelUsed,
        tokensUsed: {
          input: totalInput,
          output: totalOutput,
          total: totalInput + totalOutput,
          cost: totalCost,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      // Persist what we have so the conversation can resume
      this.sessions.update(session.id, { transcript: working });
      return {
        success: false,
        content: lastAssistantContent,
        sessionId: session.id,
        agentId: req.agentId,
        steps,
        cached,
        model: modelUsed,
        tokensUsed: { input: totalInput, output: totalOutput, total: totalInput + totalOutput, cost: totalCost },
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
    } finally {
      const cur = this.activeRuns.get(req.agentId) ?? 1;
      if (cur <= 1) this.activeRuns.delete(req.agentId);
      else this.activeRuns.set(req.agentId, cur - 1);
    }
  }

  /** Expose for the gateway: run one-shot sub-agent independent of a session */
  async runSubagent(prompt: string, parent: { agentId: string; sessionId: string; runId: string; depth: number }) {
    return this.subagents.spawn({
      prompt,
      parentAgentId: parent.agentId,
      parentSessionId: parent.sessionId,
      parentRunId: parent.runId,
      parentDepth: parent.depth,
    });
  }

  private fail(req: AgentRunRequest, runId: string, start: number, error: string): AgentRunResult {
    eventBus.emit('agent:error', { agentId: req.agentId, runId, error });
    return {
      success: false,
      content: '',
      sessionId: '',
      agentId: req.agentId,
      steps: 0,
      cached: false,
      model: '',
      tokensUsed: { input: 0, output: 0, total: 0, cost: 0 },
      durationMs: Date.now() - start,
      error,
    };
  }
}

function expandWorkspace(path: string): string {
  if (path.startsWith('~')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
    return home + path.slice(1);
  }
  return path;
}
