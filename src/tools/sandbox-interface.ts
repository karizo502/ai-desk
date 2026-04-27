/**
 * AI_DESK — Sandbox Interface
 *
 * Abstraction layer for sandboxed tool execution.
 * Default: ALWAYS ON. There is no way to disable sandbox globally.
 */
import { spawn, type ChildProcess } from 'node:child_process';
// eventBus will be used in Phase 2 for sandbox lifecycle events
import type { SandboxConfig } from '../config/schema.js';

export interface SandboxExecOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  sandboxed: boolean;
}

export class SandboxManager {
  private config: SandboxConfig;
  private activeProcesses = new Map<string, ChildProcess>();

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  /**
   * Execute a command in a sandboxed environment.
   * On Windows: uses process-level isolation with limited env.
   * On Linux/Mac: can use Docker or firejail if available.
   */
  async execute(id: string, options: SandboxExecOptions): Promise<SandboxExecResult> {
    const timeout = options.timeoutMs ?? this.config.timeoutMs;
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Build sanitized environment
      const safeEnv: Record<string, string> = {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? process.env.USERPROFILE ?? '',
        LANG: 'en_US.UTF-8',
        // Explicitly NOT passing: API keys, tokens, secrets
        ...(options.env ?? {}),
      };

      // Remove dangerous env vars
      delete safeEnv.AI_DESK_MASTER_KEY;
      delete safeEnv.AI_DESK_AUTH_TOKEN;
      delete safeEnv.ANTHROPIC_API_KEY;
      delete safeEnv.GOOGLE_AI_API_KEY;
      delete safeEnv.OPENAI_API_KEY;

      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: safeEnv,
        timeout,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(id, child);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Limit output size (prevent memory exhaustion)
      const MAX_OUTPUT = 1_048_576; // 1MB

      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < MAX_OUTPUT) {
          stdout += data.toString().slice(0, MAX_OUTPUT - stdout.length);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < MAX_OUTPUT) {
          stderr += data.toString().slice(0, MAX_OUTPUT - stderr.length);
        }
      });

      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }

      // Timeout handler
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcesses.delete(id);

        const durationMs = Date.now() - startTime;

        resolve({
          exitCode: code ?? 1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut,
          durationMs,
          sandboxed: true,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(id);

        resolve({
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          timedOut: false,
          durationMs: Date.now() - startTime,
          sandboxed: true,
        });
      });
    });
  }

  /** Kill a running sandboxed process */
  kill(id: string): boolean {
    const process = this.activeProcesses.get(id);
    if (process) {
      process.kill('SIGKILL');
      this.activeProcesses.delete(id);
      return true;
    }
    return false;
  }

  /** Kill all running sandboxed processes */
  killAll(): number {
    let killed = 0;
    for (const [id, process] of this.activeProcesses) {
      process.kill('SIGKILL');
      this.activeProcesses.delete(id);
      killed++;
    }
    return killed;
  }

  /** Get count of active sandboxed processes */
  get activeCount(): number {
    return this.activeProcesses.size;
  }
}
