/**
 * AI_DESK — Tool Executor
 *
 * Runs a model-requested tool call subject to:
 *   1. Policy engine check (deny by default)
 *   2. Optional human approval (when policy says requiresApproval)
 *   3. Sandbox execution (when tool requires it OR sandbox.mode === 'all')
 *   4. Threat detection on the tool's textual output
 *
 * Approvals are issued via a callback the gateway provides; tests pass auto-approve.
 */
import { eventBus } from '../shared/events.js';
import type { PolicyEngine } from '../tools/policy-engine.js';
import type { SandboxManager } from '../tools/sandbox-interface.js';
import type { ThreatDetector } from '../security/threat-detector.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ModelToolCall } from '../models/provider.js';
import type { SandboxConfig } from '../config/schema.js';
import { v4 as uuid } from 'uuid';

export interface ToolExecuteRequest {
  call: ModelToolCall;
  agentId: string;
  sessionId: string;
  runId: string;
  workspace: string;
  subagentDepth: number;
  /** Per-run approval requester — overrides the instance-level default when provided */
  requestApproval?: ApprovalRequester;
}

export interface ToolExecuteResult {
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
  approved: boolean;
  sandboxed: boolean;
  durationMs: number;
}

export type ApprovalRequester = (req: {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  sessionId: string;
}) => Promise<boolean>;

export class ToolExecutor {
  private policy: PolicyEngine;
  private registry: ToolRegistry;
  private sandbox: SandboxManager;
  private threat: ThreatDetector;
  private sandboxConfig: SandboxConfig;
  private requestApproval: ApprovalRequester;

  constructor(deps: {
    policy: PolicyEngine;
    registry: ToolRegistry;
    sandbox: SandboxManager;
    threat: ThreatDetector;
    sandboxConfig: SandboxConfig;
    requestApproval?: ApprovalRequester;
  }) {
    this.policy = deps.policy;
    this.registry = deps.registry;
    this.sandbox = deps.sandbox;
    this.threat = deps.threat;
    this.sandboxConfig = deps.sandboxConfig;
    this.requestApproval = deps.requestApproval ?? (async () => false);
  }

  async execute(req: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const start = Date.now();
    const tool = this.registry.get(req.call.name);
    if (!tool) {
      return {
        toolCallId: req.call.id,
        toolName: req.call.name,
        output: `Unknown tool: ${req.call.name}`,
        isError: true,
        approved: false,
        sandboxed: false,
        durationMs: Date.now() - start,
      };
    }

    eventBus.emit('tool:request', {
      tool: req.call.name,
      sessionId: req.sessionId,
      agentId: req.agentId,
    });

    // Policy check
    const decision = this.policy.checkPermission({
      name: req.call.name,
      input: req.call.input,
      sessionId: req.sessionId,
      agentId: req.agentId,
      runId: req.runId,
      subagentDepth: req.subagentDepth,
    });

    if (!decision.allowed && !decision.requiresApproval) {
      return {
        toolCallId: req.call.id,
        toolName: req.call.name,
        output: `Tool denied: ${decision.reason}`,
        isError: true,
        approved: false,
        sandboxed: false,
        durationMs: Date.now() - start,
      };
    }

    // Approval flow if required
    let approved = decision.allowed;
    if (!decision.allowed && decision.requiresApproval) {
      const requester = req.requestApproval ?? this.requestApproval;
      approved = await requester({
        requestId: uuid(),
        toolName: req.call.name,
        input: req.call.input,
        reason: decision.reason,
        sessionId: req.sessionId,
      });

      if (!approved) {
        return {
          toolCallId: req.call.id,
          toolName: req.call.name,
          output: `Tool denied by user`,
          isError: true,
          approved: false,
          sandboxed: false,
          durationMs: Date.now() - start,
        };
      }
    }

    // Execute (sandbox enforcement is the sandbox manager's job; we just hand context)
    const sandboxRequired = tool.requiresSandbox || this.sandboxConfig.mode === 'all';
    let result: { output: string; isError?: boolean };
    try {
      result = await tool.execute(req.call.input, {
        workspace: req.workspace,
        sessionId: req.sessionId,
        agentId: req.agentId,
        runId: req.runId,
        sandbox: this.sandbox,
      });
    } catch (err) {
      result = { output: `Tool threw: ${(err as Error).message}`, isError: true };
    }

    // Scan the output for prompt-injection / jailbreak attempts (tool outputs are
    // a common injection vector — e.g., a malicious file telling the agent to ignore rules)
    const scan = this.threat.scan(result.output);
    if (!scan.safe) {
      eventBus.emit('security:threat', {
        source: 'tool_output',
        tool: req.call.name,
        threats: scan.threats.map(t => t.pattern),
      });
      result = {
        output: `[Tool output blocked: contained ${scan.threats.length} threat indicator(s)]`,
        isError: true,
      };
    }

    eventBus.emit('tool:result', {
      tool: req.call.name,
      sessionId: req.sessionId,
      agentId: req.agentId,
      durationMs: Date.now() - start,
      isError: result.isError ?? false,
    });

    return {
      toolCallId: req.call.id,
      toolName: req.call.name,
      output: result.output,
      isError: result.isError ?? false,
      approved: true,
      sandboxed: sandboxRequired,
      durationMs: Date.now() - start,
    };
  }

  /** Determine which tools should be exposed to the model based on current policy */
  visibleTools(): ReturnType<ToolRegistry['list']> {
    return this.registry.listForProfile(name => {
      const decision = this.policy.checkPermission({
        name,
        input: {},
        sessionId: '__discovery__',
        agentId: '__discovery__',
        runId: '__discovery__',
        subagentDepth: 0,
      });
      // Show tools that are either allowed outright OR require approval
      // (so the model knows they exist; user can approve when called)
      return decision.allowed || decision.requiresApproval;
    });
  }
}
