/**
 * AI_DESK — MCP Registry
 *
 * Manages lifecycle for all configured MCP server connections.
 * Discovers tools from each server and exposes them through AI_DESK's
 * policy/budget system via registered tool adapters.
 *
 * Usage:
 *   const registry = new McpRegistry(mcpConfig, budgetTracker);
 *   await registry.startAll();
 *   const tools = registry.getRegisteredTools(); // inject into ToolRegistry
 */
import { McpClient, type McpTool } from './mcp-client.js';
import type { MCPConfig } from '../config/schema.js';
import type { BudgetTracker } from '../budget/budget-tracker.js';
import { eventBus } from '../shared/events.js';

export interface McpServerStatus {
  name: string;
  ready: boolean;
  toolCount: number;
  error?: string;
}

export interface McpRegisteredTool {
  serverName: string;
  tool: McpTool;
  client: McpClient;
  dailyTokenBudget: number;
}

export class McpRegistry {
  private config: MCPConfig;
  private clients = new Map<string, McpClient>();
  private tools = new Map<string, McpRegisteredTool>(); // key: "serverName:toolName"
  private started = false;

  constructor(config: MCPConfig, _budget: BudgetTracker) {
    this.config = config;
    // _budget is accepted for future per-server budget enforcement wiring
  }

  async startAll(): Promise<McpServerStatus[]> {
    const statuses: McpServerStatus[] = [];

    await Promise.allSettled(
      Object.entries(this.config.servers).map(async ([name, serverCfg]) => {
        const client = new McpClient({
          name,
          command: serverCfg.command,
          args: serverCfg.args,
          env: serverCfg.env,
        });

        client.on('stderr', (line: string) => {
          eventBus.emit('mcp:server-log', { server: name, line });
        });

        client.on('exit', ({ code, signal }: { code: number | null; signal: string | null }) => {
          eventBus.emit('mcp:server-exit', { server: name, code, signal });
          this.clients.delete(name);
          // Remove tools from this server
          for (const [key] of this.tools) {
            if (key.startsWith(`${name}:`)) this.tools.delete(key);
          }
        });

        try {
          await client.start();
          const mcpTools = await client.listTools();

          this.clients.set(name, client);

          const allowed = serverCfg.capabilities;
          for (const tool of mcpTools) {
            // Filter by declared capabilities (allowlist per-server)
            if (allowed.length > 0 && !allowed.includes(tool.name)) continue;
            this.tools.set(`${name}:${tool.name}`, {
              serverName: name,
              tool,
              client,
              dailyTokenBudget: this.config.security.perServerBudget.dailyTokens,
            });
          }

          statuses.push({ name, ready: true, toolCount: mcpTools.length });
          eventBus.emit('mcp:server-ready', { server: name, toolCount: mcpTools.length });
        } catch (err) {
          const error = (err as Error).message;
          statuses.push({ name, ready: false, toolCount: 0, error });
          eventBus.emit('mcp:server-error', { server: name, error });
        }
      })
    );

    this.started = true;
    return statuses;
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(
      [...this.clients.values()].map(c => c.stop())
    );
    this.clients.clear();
    this.tools.clear();
    this.started = false;
  }

  /** Start a single MCP server by name (for live skill enable) */
  async startOne(name: string, serverCfg: MCPConfig['servers'][string]): Promise<McpServerStatus> {
    if (this.clients.has(name)) return { name, ready: true, toolCount: 0 };

    const client = new McpClient({ name, command: serverCfg.command, args: serverCfg.args, env: serverCfg.env });
    client.on('stderr', (line: string) => eventBus.emit('mcp:server-log', { server: name, line }));
    client.on('exit', ({ code, signal }: { code: number | null; signal: string | null }) => {
      eventBus.emit('mcp:server-exit', { server: name, code, signal });
      this.clients.delete(name);
      for (const [key] of this.tools) {
        if (key.startsWith(`${name}:`)) this.tools.delete(key);
      }
    });

    try {
      await client.start();
      const mcpTools = await client.listTools();
      this.clients.set(name, client);
      const allowed = serverCfg.capabilities;
      for (const tool of mcpTools) {
        if (allowed.length > 0 && !allowed.includes(tool.name)) continue;
        this.tools.set(`${name}:${tool.name}`, {
          serverName: name, tool, client,
          dailyTokenBudget: this.config.security.perServerBudget.dailyTokens,
        });
      }
      eventBus.emit('mcp:server-ready', { server: name, toolCount: mcpTools.length });
      return { name, ready: true, toolCount: mcpTools.length };
    } catch (err) {
      const error = (err as Error).message;
      eventBus.emit('mcp:server-error', { server: name, error });
      return { name, ready: false, toolCount: 0, error };
    }
  }

  /** Stop a single MCP server by name (for live skill disable) */
  async stopOne(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) return;
    await client.stop();
    this.clients.delete(name);
    for (const [key] of this.tools) {
      if (key.startsWith(`${name}:`)) this.tools.delete(key);
    }
    eventBus.emit('mcp:server-stopped', { server: name });
  }

  /** Add a server config entry (needed before startOne can reference it) */
  addServerConfig(name: string, serverCfg: MCPConfig['servers'][string]): void {
    this.config.servers[name] = serverCfg;
  }

  /** Remove a server config entry */
  removeServerConfig(name: string): void {
    delete this.config.servers[name];
  }

  /** All discovered tool registrations (for injecting into ToolRegistry) */
  getRegisteredTools(): McpRegisteredTool[] {
    return [...this.tools.values()];
  }

  /** Status of each server */
  status(): McpServerStatus[] {
    const result: McpServerStatus[] = [];
    for (const [name, client] of this.clients) {
      const toolCount = [...this.tools.keys()].filter(k => k.startsWith(`${name}:`)).length;
      result.push({ name, ready: client.isReady, toolCount });
    }
    // Include servers that failed to start (not in clients map)
    for (const name of Object.keys(this.config.servers)) {
      if (!this.clients.has(name)) {
        result.push({ name, ready: false, toolCount: 0, error: 'not started or failed' });
      }
    }
    return result;
  }

  /** Call a tool on a specific server (used by the MCP tool adapter) */
  async callTool(serverName: string, toolName: string, input: Record<string, unknown>) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server "${serverName}" not available`);
    return client.callTool(toolName, input);
  }

  get isStarted(): boolean {
    return this.started;
  }
}
