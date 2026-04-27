/**
 * AI_DESK — MCP Client
 *
 * Manages a single stdio connection to an external MCP server process.
 * Protocol: JSON-RPC 2.0 over stdin/stdout (newline-delimited).
 *
 * Lifecycle:
 *   start() → initialize handshake → ready to list/call tools
 *   stop()  → SIGTERM the child process
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { v4 as uuid } from 'uuid';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: 'text'; text: string } | { type: 'error'; text: string }>;
  isError: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export class McpClient extends EventEmitter {
  readonly serverName: string;
  private command: string;
  private args: string[];
  private env: Record<string, string>;
  private process: ChildProcess | null = null;
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private ready = false;
  private timeoutMs: number;

  constructor(opts: {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    timeoutMs?: number;
  }) {
    super();
    this.serverName = opts.name;
    this.command = opts.command;
    this.args = opts.args ?? [];
    this.env = opts.env ?? {};
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  get isReady(): boolean {
    return this.ready;
  }

  async start(): Promise<void> {
    if (this.process) return;

    this.process = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    // Wrap spawn errors into a promise so callers can catch them via try/catch.
    // Without this, an unhandled EventEmitter 'error' event crashes Node before
    // the initialize request below has a chance to time out and reject.
    const spawnError = new Promise<never>((_, reject) => {
      this.process!.once('error', err => {
        const wrapped = new Error(`MCP server "${this.serverName}" failed to start: ${err.message}`);
        this.emit('error', wrapped);
        reject(wrapped);
      });
    });

    this.process.on('error', () => {
      // Secondary listener — ensures the EventEmitter 'error' event always has
      // at least one listener attached, preventing Node from throwing on late
      // error emissions after start() has already resolved or rejected.
    });

    this.process.on('exit', (code, signal) => {
      this.ready = false;
      this.process = null;
      // Reject any pending requests
      for (const [, { reject }] of this.pending) {
        reject(new Error(`MCP server "${this.serverName}" exited (code=${code}, signal=${signal})`));
      }
      this.pending.clear();
      this.emit('exit', { code, signal });
    });

    // Collect stderr for logging
    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('stderr', data.toString());
    });

    // Parse stdout as newline-delimited JSON-RPC
    const rl = createInterface({ input: this.process.stdout! });
    rl.on('line', line => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
        if ('id' in msg) {
          // Response
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(`${msg.error.message} (code=${msg.error.code})`));
            } else {
              pending.resolve(msg.result);
            }
          }
        } else {
          // Notification
          this.emit('notification', msg);
        }
      } catch {
        this.emit('parse-error', line);
      }
    });

    // MCP initialize handshake — race against spawn failure so we reject fast
    // instead of waiting for the 30s request timeout when the process never starts.
    const initResult = await Promise.race([
      this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'ai-desk', version: '2.0.0' },
      }),
      spawnError,
    ]);
    // Store capabilities for potential future use (e.g. prompts, resources)
    void ((initResult as { capabilities?: Record<string, unknown> }).capabilities);

    // Send initialized notification (no response expected)
    this.notify('notifications/initialized', {});

    this.ready = true;
    this.emit('ready');
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    this.ready = false;
    this.process.kill('SIGTERM');
    // Give it 3s then SIGKILL
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 3000);
      this.process!.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.process = null;
  }

  async listTools(): Promise<McpTool[]> {
    this.assertReady();
    const result = await this.request('tools/list', {}) as { tools?: unknown[] };
    const rawTools = result.tools ?? [];
    return rawTools.map((t: unknown) => {
      const tool = t as { name: string; description?: string; inputSchema?: Record<string, unknown> };
      return {
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      };
    });
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<McpCallResult> {
    this.assertReady();
    const result = await this.request('tools/call', { name, arguments: input }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const content = (result.content ?? []).map(c => ({
      type: (c.type === 'error' ? 'error' : 'text') as 'text' | 'error',
      text: c.text ?? '',
    }));

    return {
      content,
      isError: result.isError ?? content.some(c => c.type === 'error'),
    };
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error(`MCP server "${this.serverName}" not running`));
        return;
      }

      const id = uuid();
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" to "${this.serverName}" timed out (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: r => { clearTimeout(timer); resolve(r); },
        reject: e => { clearTimeout(timer); reject(e); },
      });

      this.process.stdin!.write(JSON.stringify(msg) + '\n');
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.process?.stdin) return;
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    this.process.stdin.write(JSON.stringify(msg) + '\n');
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new Error(`MCP server "${this.serverName}" is not ready`);
    }
  }
}
