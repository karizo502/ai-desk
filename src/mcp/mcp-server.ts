/**
 * AI_DESK — MCP Server (stdio transport)
 *
 * Exposes AI_DESK as an MCP server over stdin/stdout so any MCP client
 * (Claude Code, Claude Desktop, Cursor, Zed…) can connect and use:
 *
 *   • All registered tools (filtered through PolicyEngine)
 *   • agent_run — run the full agent loop from an MCP tool call
 *   • skill_list / skill_enable / skill_disable — manage skills remotely
 *
 * Usage (Claude Code):
 *   claude mcp add ai-desk -- npx tsx src/cli/index.ts serve-mcp
 *
 * Protocol: JSON-RPC 2.0 over newline-delimited stdin/stdout.
 * No authentication — stdio transport relies on OS process isolation.
 */
import { createInterface } from 'node:readline';
import type { ToolRegistry } from '../agents/tool-registry.js';
import type { PolicyEngine } from '../tools/policy-engine.js';
import type { AgentRuntime } from '../agents/agent-runtime.js';
import type { SkillRegistry } from '../skills/skill-registry.js';

const SERVER_INFO = { name: 'ai-desk', version: '3.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpServer {
  private tools: ToolRegistry;
  private policy: PolicyEngine;
  private runtime: AgentRuntime;
  private skills: SkillRegistry | null;
  private initialized = false;
  private defaultAgentId: string;

  constructor(opts: {
    tools: ToolRegistry;
    policy: PolicyEngine;
    runtime: AgentRuntime;
    skills?: SkillRegistry;
    defaultAgentId: string;
  }) {
    this.tools = opts.tools;
    this.policy = opts.policy;
    this.runtime = opts.runtime;
    this.skills = opts.skills ?? null;
    this.defaultAgentId = opts.defaultAgentId;
  }

  /** Start reading requests from stdin and writing responses to stdout */
  serve(): void {
    const rl = createInterface({ input: process.stdin, terminal: false });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        this.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        return;
      }

      try {
        const result = await this.dispatch(request);
        if (request.id !== undefined) {
          this.send({ jsonrpc: '2.0', id: request.id, result });
        }
      } catch (err) {
        const msg = err instanceof McpError ? err : new McpError(-32603, (err as Error).message);
        if (request.id !== undefined) {
          this.send({ jsonrpc: '2.0', id: request.id, error: { code: msg.code, message: msg.message } });
        }
      }
    });

    rl.on('close', () => process.exit(0));

    // Log to stderr (stdout is reserved for protocol messages)
    process.stderr.write('[AI_DESK MCP Server] ready on stdio\n');
  }

  // ─── Dispatch ─────────────────────────────────────────────

  private async dispatch(req: JsonRpcRequest): Promise<unknown> {
    switch (req.method) {
      case 'initialize':         return this.handleInitialize(req.params);
      case 'notifications/initialized': return; // client ack — no response needed
      case 'ping':               return {};
      case 'tools/list':         return this.handleToolsList();
      case 'tools/call':         return this.handleToolsCall(req.params);
      case 'resources/list':     return { resources: [] };
      case 'prompts/list':       return this.handlePromptsList();
      case 'prompts/get':        return this.handlePromptsGet(req.params);
      default:
        throw new McpError(-32601, `Method not found: ${req.method}`);
    }
  }

  // ─── Handlers ─────────────────────────────────────────────

  private handleInitialize(params: unknown): unknown {
    const p = params as { protocolVersion?: string; clientInfo?: { name: string } };
    this.initialized = true;
    process.stderr.write(`[AI_DESK MCP] client: ${p.clientInfo?.name ?? 'unknown'}\n`);
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: {},
        prompts: { listChanged: false },
      },
      serverInfo: SERVER_INFO,
    };
  }

  private handleToolsList(): unknown {
    // Expose tools visible under the current policy + the built-in meta-tools
    const policyTools = this.visibleToolDefinitions();
    const metaTools = this.metaToolDefinitions();
    return { tools: [...policyTools, ...metaTools] };
  }

  private async handleToolsCall(params: unknown): Promise<unknown> {
    if (!this.initialized) throw new McpError(-32002, 'Server not initialized');

    const p = params as { name?: string; arguments?: Record<string, unknown> };
    const name = p.name ?? '';
    const args = p.arguments ?? {};

    // Handle meta-tools first
    const meta = await this.dispatchMetaTool(name, args);
    if (meta !== undefined) return meta;

    // Regular tool — check policy (MCP context is treated as pre-authenticated)
    const decision = this.policy.checkPermission({
      name,
      input: args,
      sessionId: 'mcp',
      agentId: 'mcp',
      runId: 'mcp',
      subagentDepth: 0,
    });

    if (!decision.allowed && !decision.requiresApproval) {
      return {
        content: [{ type: 'text', text: `Tool denied by policy: ${decision.reason}` }],
        isError: true,
      };
    }

    const tool = this.tools.get(name);
    if (!tool) throw new McpError(-32602, `Unknown tool: ${name}`);

    try {
      const result = await tool.execute(args, {
        workspace: process.cwd(),
        sessionId: 'mcp',
        agentId: 'mcp',
        runId: `mcp-${Date.now()}`,
        sandbox: { execute: async () => ({ exitCode: 1, stdout: '', stderr: 'sandbox unavailable in MCP server mode', timedOut: false, durationMs: 0 }), killAll: () => 0 } as never,
      });
      return {
        content: [{ type: result.isError ? 'error' : 'text', text: result.output }],
        isError: result.isError ?? false,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }

  private handlePromptsList(): unknown {
    // Expose skill system prompts as MCP prompts
    const prompts = [];
    if (this.skills) {
      for (const skill of this.skills.list()) {
        if (skill.state.enabled && skill.definition.systemPromptAddition) {
          prompts.push({
            name: `skill:${skill.definition.name}`,
            description: skill.definition.description,
          });
        }
      }
    }
    prompts.push({ name: 'agent:system', description: 'AI_DESK base system prompt' });
    return { prompts };
  }

  private handlePromptsGet(params: unknown): unknown {
    const p = params as { name?: string };
    const name = p.name ?? '';

    if (name === 'agent:system') {
      const prompt = this.skills?.composedSystemPrompt() ??
        'You are AI_DESK, a security-first AI assistant.';
      return { description: 'AI_DESK system prompt', messages: [{ role: 'system', content: { type: 'text', text: prompt } }] };
    }

    if (name.startsWith('skill:') && this.skills) {
      const skillName = name.slice('skill:'.length);
      const skill = this.skills.get(skillName);
      if (skill?.definition.systemPromptAddition) {
        return {
          description: skill.definition.description,
          messages: [{ role: 'system', content: { type: 'text', text: skill.definition.systemPromptAddition } }],
        };
      }
    }

    throw new McpError(-32602, `Prompt not found: ${name}`);
  }

  // ─── Meta-tools ───────────────────────────────────────────

  private metaToolDefinitions(): Array<{ name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] } }> {
    const defs: Array<{ name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] } }> = [
      {
        name: 'agent_run',
        description: 'Run the AI_DESK agent loop on a prompt. Returns the agent\'s final reply.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The user prompt for the agent' },
            agentId: { type: 'string', description: 'Agent id to use (default: main agent)' },
            maxSteps: { type: 'number', description: 'Max reasoning steps (default 10)' },
          },
          required: ['prompt'],
        },
      },
    ];

    if (this.skills) {
      defs.push(
        {
          name: 'skill_list',
          description: 'List all available skills and their enabled status.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'skill_enable',
          description: 'Enable a skill by name.',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Skill name to enable' } },
            required: ['name'],
          },
        },
        {
          name: 'skill_disable',
          description: 'Disable a skill by name.',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Skill name to disable' } },
            required: ['name'],
          },
        },
      );
    }

    return defs;
  }

  private async dispatchMetaTool(name: string, args: Record<string, unknown>): Promise<unknown | undefined> {
    if (name === 'agent_run') {
      const prompt = String(args.prompt ?? '');
      const agentId = String(args.agentId ?? this.defaultAgentId);
      const maxSteps = Number(args.maxSteps ?? 10);

      const result = await this.runtime.run({
        userMessage: prompt,
        agentId,
        channelId: 'mcp',
        peerId: 'mcp-client',
        maxSteps,
      });

      const text = result.success
        ? result.content
        : `[Error] ${result.error}`;

      return { content: [{ type: 'text', text }], isError: !result.success };
    }

    if (name === 'skill_list' && this.skills) {
      const lines = this.skills.list().map(s =>
        `${s.state.enabled ? '✓' : '○'} ${s.definition.name} v${s.definition.version} — ${s.definition.description}`
      );
      return { content: [{ type: 'text', text: lines.join('\n') || '(no skills found)' }] };
    }

    if (name === 'skill_enable' && this.skills) {
      const skillName = String(args.name ?? '');
      const ok = this.skills.enable(skillName);
      return { content: [{ type: 'text', text: ok ? `Enabled: ${skillName}` : `Skill not found: ${skillName}` }], isError: !ok };
    }

    if (name === 'skill_disable' && this.skills) {
      const skillName = String(args.name ?? '');
      const ok = this.skills.disable(skillName);
      return { content: [{ type: 'text', text: ok ? `Disabled: ${skillName}` : `Skill not found: ${skillName}` }], isError: !ok };
    }

    return undefined;
  }

  // ─── Helpers ─────────────────────────────────────────────

  private visibleToolDefinitions() {
    return this.tools.listForProfile(name => {
      const d = this.policy.checkPermission({ name, input: {}, sessionId: 'mcp', agentId: 'mcp', runId: 'mcp', subagentDepth: 0 });
      return d.allowed || d.requiresApproval;
    });
  }

  private send(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

class McpError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}
