/**
 * AI_DESK — MCP Tool Adapter
 *
 * Converts McpRegisteredTool entries (discovered from external MCP servers)
 * into RegisteredTool instances that ToolRegistry/PolicyEngine/ToolExecutor
 * can handle transparently.
 *
 * Tool names are prefixed "mcp_<server>_" to avoid collisions and allow
 * the policy engine to apply per-server rules.
 */
import type { ToolRegistry, RegisteredTool } from '../agents/tool-registry.js';
import type { McpRegistry, McpRegisteredTool } from './mcp-registry.js';

export class McpToolAdapter {
  private toolRegistry: ToolRegistry;
  private mcpRegistry: McpRegistry;
  private registeredNames: string[] = [];

  constructor(toolRegistry: ToolRegistry, mcpRegistry: McpRegistry) {
    this.toolRegistry = toolRegistry;
    this.mcpRegistry = mcpRegistry;
  }

  /**
   * Register all MCP tools into the tool registry.
   * Call after McpRegistry.startAll() completes.
   * Returns the list of registered tool names.
   */
  registerAll(): string[] {
    this.registeredNames = [];

    for (const mcpTool of this.mcpRegistry.getRegisteredTools()) {
      const name = this.toolName(mcpTool);
      const registered = this.buildRegisteredTool(name, mcpTool);
      this.toolRegistry.register(registered);
      this.registeredNames.push(name);
    }

    return this.registeredNames;
  }

  getRegisteredNames(): string[] {
    return this.registeredNames;
  }

  /**
   * Unregister tools whose name prefix matches the given MCP server name.
   * Call when stopping an MCP server (e.g. live skill disable).
   */
  unregisterAllForServer(serverName: string): number {
    const sanitised = serverName.replace(/[^a-z0-9]/gi, '_');
    const prefix = `mcp_${sanitised}_`;
    let removed = 0;
    this.registeredNames = this.registeredNames.filter(n => {
      if (n.startsWith(prefix)) {
        if (this.toolRegistry.unregister(n)) removed++;
        return false;
      }
      return true;
    });
    return removed;
  }

  private toolName(mcpTool: McpRegisteredTool): string {
    // Sanitise server/tool names to valid identifier characters
    const server = mcpTool.serverName.replace(/[^a-z0-9]/gi, '_');
    const tool = mcpTool.tool.name.replace(/[^a-z0-9]/gi, '_');
    return `mcp_${server}_${tool}`;
  }

  private buildRegisteredTool(name: string, mcpTool: McpRegisteredTool): RegisteredTool {
    const { serverName, tool } = mcpTool;

    return {
      definition: {
        name,
        description: `[MCP:${serverName}] ${tool.description}`,
        // MCP servers return arbitrary JSON Schema; we cast to the expected shape.
        // The actual schema is passed through for validation by the model.
        inputSchema: tool.inputSchema as { type: 'object'; properties: Record<string, unknown> },
      },
      // MCP tools run in sandbox by default (governed by mcp.security.sandboxAll config)
      requiresSandbox: true,
      execute: async (input) => {
        try {
          const result = await this.mcpRegistry.callTool(serverName, tool.name, input);
          const text = result.content.map(c => c.text).join('\n');
          return { output: text || '(no output)', isError: result.isError };
        } catch (err) {
          return {
            output: `MCP tool error (${serverName}/${tool.name}): ${(err as Error).message}`,
            isError: true,
          };
        }
      },
    };
  }
}
