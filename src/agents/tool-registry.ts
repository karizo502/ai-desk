/**
 * AI_DESK — Built-in Tool Registry
 *
 * Tools are defined here with: name, description, schema, and an executor.
 * Default-shipped tools are read-only and safe; anything stronger must be
 * explicitly enabled in the policy + executed via the sandbox.
 *
 * NOTE: Tool names use prefixes (read_, write_, exec_, search_…) to make
 * the policy engine's profile rules useful out of the box.
 */
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, isAbsolute, normalize, dirname } from 'node:path';
import { glob } from 'node:fs/promises';
import type { ModelToolDefinition } from '../models/provider.js';
import type { SandboxManager } from '../tools/sandbox-interface.js';

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<{ output: string; isError?: boolean }>;

export interface ToolContext {
  workspace: string;
  sessionId: string;
  agentId: string;
  runId: string;
  sandbox: SandboxManager;
}

export interface RegisteredTool {
  definition: ModelToolDefinition;
  /** Whether this tool MUST run inside the sandbox (overrides config) */
  requiresSandbox: boolean;
  execute: ToolExecutor;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    this.registerBuiltins();
  }

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): ModelToolDefinition[] {
    return [...this.tools.values()].map(t => t.definition);
  }

  /** Subset of tools allowed for a given policy profile */
  listForProfile(allowed: (name: string) => boolean): ModelToolDefinition[] {
    return [...this.tools.values()]
      .filter(t => allowed(t.definition.name))
      .map(t => t.definition);
  }

  // ─── Built-in tools ──────────────────────────────────────────
  private registerBuiltins(): void {
    this.register({
      definition: {
        name: 'read_file',
        description: 'Read the contents of a file inside the agent workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path inside workspace' },
          },
          required: ['path'],
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const path = resolveSafe(ctx.workspace, String(input.path ?? ''));
        if (!path) return { output: 'Error: path escapes workspace', isError: true };
        try {
          const data = await readFile(path, 'utf-8');
          if (data.length > 100_000) {
            return { output: data.slice(0, 100_000) + '\n[truncated]' };
          }
          return { output: data };
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }
      },
    });

    this.register({
      definition: {
        name: 'list_files',
        description: 'List files and folders in a directory inside the agent workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path; default "."' },
          },
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const path = resolveSafe(ctx.workspace, String(input.path ?? '.'));
        if (!path) return { output: 'Error: path escapes workspace', isError: true };
        try {
          const entries = await readdir(path, { withFileTypes: true });
          const lines = entries.slice(0, 200).map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
          return { output: lines.join('\n') || '(empty)' };
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }
      },
    });

    this.register({
      definition: {
        name: 'view_stat',
        description: 'Show file size and modification time.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const path = resolveSafe(ctx.workspace, String(input.path ?? ''));
        if (!path) return { output: 'Error: path escapes workspace', isError: true };
        try {
          const s = await stat(path);
          return { output: `size=${s.size} mtime=${s.mtime.toISOString()} ${s.isDirectory() ? 'dir' : 'file'}` };
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }
      },
    });

    this.register({
      definition: {
        name: 'write_file',
        description: 'Write (or overwrite) a file inside the agent workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path inside workspace' },
            content: { type: 'string', description: 'Content to write' },
            append: { type: 'boolean', description: 'Append instead of overwrite (default false)' },
          },
          required: ['path', 'content'],
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const path = resolveSafe(ctx.workspace, String(input.path ?? ''));
        if (!path) return { output: 'Error: path escapes workspace', isError: true };
        const content = String(input.content ?? '');
        const append = Boolean(input.append);
        try {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, content, { encoding: 'utf-8', flag: append ? 'a' : 'w' });
          return { output: `Written ${content.length} chars to ${input.path}` };
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }
      },
    });

    this.register({
      definition: {
        name: 'grep',
        description: 'Search for a regex pattern in files inside the workspace. Returns matching lines with line numbers.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regular expression to search for' },
            path: { type: 'string', description: 'File or directory to search (default ".")' },
            glob: { type: 'string', description: 'Glob filter when path is a directory (e.g. "**/*.ts")' },
            case_insensitive: { type: 'boolean', description: 'Case-insensitive search (default false)' },
            max_results: { type: 'number', description: 'Max matching lines to return (default 200)' },
          },
          required: ['pattern'],
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const pattern = String(input.pattern ?? '');
        if (!pattern) return { output: 'Error: pattern is required', isError: true };

        const flags = input.case_insensitive ? 'gi' : 'g';
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, flags);
        } catch {
          return { output: `Error: invalid regex: ${pattern}`, isError: true };
        }

        const searchPath = resolveSafe(ctx.workspace, String(input.path ?? '.'));
        if (!searchPath) return { output: 'Error: path escapes workspace', isError: true };

        const maxResults = Math.min(Number(input.max_results ?? 200), 500);
        const matches: string[] = [];

        const searchFile = async (filePath: string, displayPath: string): Promise<void> => {
          if (matches.length >= maxResults) return;
          try {
            const rl = createInterface({ input: createReadStream(filePath, 'utf-8'), crlfDelay: Infinity });
            let lineNo = 0;
            for await (const line of rl) {
              lineNo++;
              if (matches.length >= maxResults) break;
              if (regex.test(line)) {
                matches.push(`${displayPath}:${lineNo}: ${line}`);
              }
              regex.lastIndex = 0; // reset for global flag
            }
          } catch { /* skip unreadable files */ }
        };

        try {
          const s = await stat(searchPath);
          if (s.isFile()) {
            await searchFile(searchPath, String(input.path ?? '.'));
          } else {
            const globPattern = String(input.glob ?? '**/*');
            for await (const entry of glob(globPattern, { cwd: searchPath })) {
              if (matches.length >= maxResults) break;
              const absEntry = resolve(searchPath, entry);
              const entryS = await stat(absEntry).catch(() => null);
              if (entryS?.isFile()) {
                await searchFile(absEntry, entry);
              }
            }
          }
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }

        if (matches.length === 0) return { output: '(no matches)' };
        const suffix = matches.length >= maxResults ? `\n[truncated at ${maxResults} results]` : '';
        return { output: matches.join('\n') + suffix };
      },
    });

    this.register({
      definition: {
        name: 'glob',
        description: 'Find files matching a glob pattern inside the workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern e.g. "src/**/*.ts"' },
            cwd: { type: 'string', description: 'Base directory (default workspace root)' },
            max_results: { type: 'number', description: 'Max paths to return (default 200)' },
          },
          required: ['pattern'],
        },
      },
      requiresSandbox: false,
      execute: async (input, ctx) => {
        const pattern = String(input.pattern ?? '');
        if (!pattern) return { output: 'Error: pattern is required', isError: true };

        const base = resolveSafe(ctx.workspace, String(input.cwd ?? '.'));
        if (!base) return { output: 'Error: cwd escapes workspace', isError: true };

        const maxResults = Math.min(Number(input.max_results ?? 200), 1000);
        const results: string[] = [];

        try {
          for await (const entry of glob(pattern, { cwd: base })) {
            results.push(entry);
            if (results.length >= maxResults) break;
          }
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }

        if (results.length === 0) return { output: '(no matches)' };
        const suffix = results.length >= maxResults ? `\n[truncated at ${maxResults} results]` : '';
        return { output: results.join('\n') + suffix };
      },
    });

    this.register({
      definition: {
        name: 'fetch_url',
        description: 'Fetch a URL and return the response body (GET only). Max 500KB.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch (https:// only)' },
            headers: {
              type: 'object',
              description: 'Optional request headers',
              additionalProperties: { type: 'string' },
            },
            max_bytes: { type: 'number', description: 'Max response bytes (default 102400, max 512000)' },
          },
          required: ['url'],
        },
      },
      requiresSandbox: false,
      execute: async (input) => {
        const url = String(input.url ?? '').trim();
        if (!url) return { output: 'Error: url is required', isError: true };

        // Only allow https (and http for localhost) to prevent SSRF to internal services
        if (!/^https:\/\//i.test(url) && !/^http:\/\/localhost/i.test(url) && !/^http:\/\/127\./i.test(url)) {
          return { output: 'Error: only https:// URLs are allowed', isError: true };
        }

        const maxBytes = Math.min(Number(input.max_bytes ?? 102_400), 512_000);
        const userHeaders = (input.headers && typeof input.headers === 'object')
          ? input.headers as Record<string, string>
          : {};

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'User-Agent': 'AI-DESK/3.0 fetch_tool',
              ...userHeaders,
            },
            signal: AbortSignal.timeout(15_000),
          });

          const contentType = response.headers.get('content-type') ?? '';
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer).slice(0, maxBytes);
          const truncated = buffer.byteLength > maxBytes;

          // Decode as text; strip binary noise
          const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          const suffix = truncated ? `\n[truncated — fetched ${maxBytes} of ${buffer.byteLength} bytes]` : '';

          return {
            output: `HTTP ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${text}${suffix}`,
            isError: !response.ok,
          };
        } catch (err) {
          return { output: `Error: ${(err as Error).message}`, isError: true };
        }
      },
    });

    this.register({
      definition: {
        name: 'exec_command',
        description: 'Execute a sandboxed shell command. Requires explicit allowlist; off by default.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
          },
          required: ['command'],
        },
      },
      requiresSandbox: true,
      execute: async (input, ctx) => {
        const command = String(input.command ?? '').trim();
        if (!command) return { output: 'Error: empty command', isError: true };
        const args = Array.isArray(input.args) ? input.args.map(String) : [];

        const result = await ctx.sandbox.execute(`${ctx.runId}-exec`, {
          command,
          args,
          cwd: ctx.workspace,
        });

        const out =
          `exit=${result.exitCode} duration=${result.durationMs}ms timedOut=${result.timedOut}\n` +
          (result.stdout ? `--- stdout ---\n${result.stdout}\n` : '') +
          (result.stderr ? `--- stderr ---\n${result.stderr}\n` : '');
        return { output: out, isError: result.exitCode !== 0 };
      },
    });
  }
}

/** Resolve a path inside workspace; returns null if it escapes (path-traversal guard) */
function resolveSafe(workspace: string, requested: string): string | null {
  const wsAbs = resolve(workspace);
  const target = isAbsolute(requested) ? normalize(requested) : resolve(wsAbs, requested);
  if (!target.startsWith(wsAbs)) return null;
  return target;
}
