#!/usr/bin/env node
/**
 * AI_DESK — CLI Entry Point
 *
 * Commands:
 *   ai-desk gateway           Start the gateway server
 *   ai-desk security audit    Run security audit
 *   ai-desk token create      Create auth token
 *   ai-desk token list        List auth tokens
 *   ai-desk token revoke      Revoke auth token
 */
import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const { version } = _require('../../package.json');
import { spawn } from 'node:child_process';
import { runOnboard } from './onboard.js';
import { installDaemon, uninstallDaemon, startDaemon, stopDaemon, restartDaemon, daemonStatus } from './daemon.js';
import { GatewayServer } from '../gateway/server.js';
import { AuditEngine } from '../security/audit-engine.js';
import { loadConfig } from '../config/config-loader.js';
import { AuthManager } from '../auth/auth-manager.js';
import { CredentialStore } from '../auth/credential-store.js';
import { BudgetTracker } from '../budget/budget-tracker.js';
import { ResponseCache } from '../cache/response-cache.js';
import { ModelRouter } from '../models/model-router.js';
import { ToolRegistry } from '../agents/tool-registry.js';
import { ToolExecutor } from '../agents/tool-executor.js';
import { SubagentSpawner } from '../agents/subagent-spawner.js';
import { ContextCompactor } from '../agents/compactor.js';
import { AgentRuntime } from '../agents/agent-runtime.js';
import { SessionStore } from '../sessions/session-store.js';
import { PolicyEngine } from '../tools/policy-engine.js';
import { SandboxManager } from '../tools/sandbox-interface.js';
import { ThreatDetector } from '../security/threat-detector.js';
import { McpClient } from '../mcp/mcp-client.js';
import { McpRegistry } from '../mcp/mcp-registry.js';
import { Orchestrator } from '../orchestration/orchestrator.js';
import type { TaskDefinition } from '../orchestration/task-graph.js';
import { MessagingManager } from '../messaging/messaging-manager.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { McpServer } from '../mcp/mcp-server.js';
import 'dotenv/config';

const __pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const __pkgSkills = resolve(__pkgRoot, 'skills');

// ─── PID-file helpers (background mode) ───────────────────
const __filename_idx = fileURLToPath(import.meta.url);

function getPidFile(): string {
  const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
  return resolve(dataDir, 'gateway.pid');
}

function writePid(pid: number): void {
  const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
  mkdirSync(resolve(dataDir), { recursive: true });
  writeFileSync(getPidFile(), String(pid), 'utf-8');
}

function readPid(): number | null {
  const f = getPidFile();
  if (!existsSync(f)) return null;
  const n = parseInt(readFileSync(f, 'utf-8').trim(), 10);
  return isNaN(n) ? null : n;
}

function deletePid(): void {
  try { unlinkSync(getPidFile()); } catch { /* already gone */ }
}

function killGateway(): { pid: number } | null {
  const pid = readPid();
  if (pid === null) return null;
  try { process.kill(pid, 'SIGTERM'); } catch { /* process already dead */ }
  deletePid();
  return { pid };
}

function spawnBackground(configPath: string): number {
  const child = spawn(
    process.execPath,
    [__filename_idx, 'gateway', '--config', resolve(configPath)],
    { detached: true, stdio: 'ignore', env: process.env, windowsHide: true },
  );
  child.unref();
  return child.pid!;
}

function bgSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const program = new Command();

program
  .name('ai-desk')
  .description('AI_DESK — Security-First AI Gateway')
  .version(version);

// ─── Onboard ──────────────────────────────────────────────
program
  .command('onboard')
  .description('Interactive setup wizard — configure gateway, keys, and generate first auth token')
  .option('--install-daemon', 'Also install as system daemon (no prompt)')
  .action(async (opts) => {
    await runOnboard({ installDaemon: opts.installDaemon });
  });

// ─── Daemon ───────────────────────────────────────────────
const daemonCmd = program
  .command('daemon')
  .description('Manage the gateway as a background service (auto-start on boot)');

daemonCmd
  .command('install')
  .description('Install and start the gateway daemon')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (opts) => {
    const platform: Record<string, string> = {
      win32: 'Windows Task Scheduler', linux: 'systemd', darwin: 'launchd',
    };
    console.log(`\n🔧 Installing AI_DESK daemon (${platform[process.platform] ?? process.platform})…\n`);
    try {
      await installDaemon(opts.config);
      console.log('✅ Daemon installed and started.');
      console.log('   Starts automatically on next login / boot.\n');
    } catch (e) {
      console.error(`\n❌ ${(e as Error).message}`);
      if (process.platform === 'linux') console.error('   Tip: try  sudo ai-desk daemon install');
      process.exit(1);
    }
  });

daemonCmd
  .command('uninstall')
  .description('Stop and remove the gateway daemon')
  .action(async () => {
    console.log('\n🔧 Removing AI_DESK daemon…\n');
    try {
      await uninstallDaemon();
      console.log('✅ Daemon removed.\n');
    } catch (e) {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

daemonCmd
  .command('start')
  .description('Start the daemon (if already installed)')
  .action(async () => {
    try { await startDaemon(); console.log('✅ Daemon started.\n'); }
    catch (e) { console.error(`\n❌ ${(e as Error).message}\n`); process.exit(1); }
  });

daemonCmd
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    try { await stopDaemon(); console.log('✅ Daemon stopped.\n'); }
    catch (e) { console.error(`\n❌ ${(e as Error).message}\n`); process.exit(1); }
  });

daemonCmd
  .command('restart')
  .description('Stop then restart the daemon')
  .action(async () => {
    console.log('\n🔄 Restarting AI_DESK daemon…\n');
    try {
      await restartDaemon();
      console.log('✅ Daemon restarted.\n');
    } catch (e) {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

daemonCmd
  .command('status')
  .description('Show daemon installation and running state')
  .action(() => {
    const s = daemonStatus();
    console.log(`\n⚙️  AI_DESK Daemon Status\n`);
    console.log(`   Platform:  ${s.platform}`);
    console.log(`   Installed: ${s.installed ? '✅ yes' : '❌ no'}`);
    console.log(`   Running:   ${s.running   ? '🟢 yes' : '🔴 no'}`);
    if (s.detail) console.log(`   Detail:    ${s.detail}`);
    console.log();
    if (!s.installed) {
      console.log('   Install with:  ai-desk daemon install\n');
    }
  });

// ─── Gateway ──────────────────────────────────────────────
program
  .command('gateway')
  .description('Start the AI_DESK gateway server')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .option('--setup-port <port>', 'Port for first-run setup wizard', '18789')
  .option('-b, --background', 'Run as detached background process (stores PID in .ai-desk-data/gateway.pid)')
  .action(async (opts) => {
    // ── Background mode: spawn detached child, write PID file, exit ──
    if (opts.background) {
      const configPath = resolve(opts.config);
      if (!existsSync(configPath) || !process.env.AI_DESK_MASTER_KEY) {
        console.error('\n❌ Run setup first before using --background:\n   ai-desk gateway --config ai-desk.json\n');
        process.exit(1);
      }
      // Kill any existing background instance
      const prev = killGateway();
      if (prev) console.log(`🛑 Stopped previous instance (PID ${prev.pid})`);

      const pid = spawnBackground(opts.config);
      writePid(pid);
      console.log(`\n✅ AI_DESK gateway started in background`);
      console.log(`   PID:     ${pid}`);
      console.log(`   Config:  ${configPath}`);
      console.log(`   Stop:    ai-desk stop`);
      console.log(`   Restart: ai-desk restart --config ${opts.config}\n`);
      process.exit(0);
    }

    const configPath  = resolve(opts.config);
    const configReady = existsSync(configPath) && !!process.env.AI_DESK_MASTER_KEY;

    // ── First run: no config / no master key → launch setup wizard ──
    if (!configReady) {
      const { SetupServer } = await import('../setup/setup-server.js');
      const setupPort = parseInt(opts.setupPort, 10) || 18789;

      const onLaunch = async (cfg: string) => {
        const gateway = new GatewayServer(cfg);
        const shutdown = async () => { await gateway.shutdown(); process.exit(0); };
        process.on('SIGINT',  shutdown);
        process.on('SIGTERM', shutdown);
        await gateway.start();
      };

      const setup = new SetupServer(onLaunch);
      await setup.start(setupPort);

      const setupUrl = `http://127.0.0.1:${setupPort}/setup`;
      console.log(`\n🚀  AI_DESK First-Run Setup`);
      console.log(`    No config found — opening setup wizard…`);
      console.log(`\n    ➜  ${setupUrl}\n`);

      // Auto-open browser (best-effort, ignore errors)
      try {
        const openCmd =
          process.platform === 'win32'  ? { cmd: 'cmd',      args: ['/c', 'start', '', setupUrl] } :
          process.platform === 'darwin' ? { cmd: 'open',     args: [setupUrl] } :
                                          { cmd: 'xdg-open', args: [setupUrl] };
        spawn(openCmd.cmd, openCmd.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      } catch { /* non-fatal */ }

      // Keep process alive while setup server runs (it calls onLaunch to continue)
      await new Promise<void>(() => { /* lives until onLaunch → gateway.start() */ });
      return;
    }

    // ── Normal start ──────────────────────────────────────────────
    const server = new GatewayServer(opts.config);
    const shutdown = async () => { await server.shutdown(); process.exit(0); };
    process.on('SIGINT',  shutdown);
    process.on('SIGTERM', shutdown);
    await server.start();
  });

// ─── Stop / Restart (background mode) ────────────────────
program
  .command('stop')
  .description('Stop a background gateway process started with --background')
  .action(() => {
    const result = killGateway();
    if (!result) {
      console.log('\n⚠️  No background gateway found (no PID file).');
      console.log('   If running as daemon, use: ai-desk daemon stop\n');
      process.exit(1);
    }
    console.log(`\n✅ Gateway stopped (PID ${result.pid})\n`);
  });

program
  .command('restart')
  .description('Restart a background gateway process (stop + start in background)')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (opts) => {
    console.log('\n🔄 Restarting AI_DESK gateway…\n');

    // Stop existing background instance
    const prev = killGateway();
    if (prev) {
      console.log(`🛑 Stopped PID ${prev.pid} — waiting for clean shutdown…`);
      await bgSleep(1500);
    } else {
      console.log('ℹ️  No existing background process found — starting fresh.');
    }

    const configPath = resolve(opts.config);
    if (!existsSync(configPath) || !process.env.AI_DESK_MASTER_KEY) {
      console.error(`\n❌ Config not ready. Run setup first:\n   ai-desk gateway --config ${opts.config}\n`);
      process.exit(1);
    }

    const pid = spawnBackground(opts.config);
    writePid(pid);
    console.log(`\n✅ Gateway restarted (PID ${pid})\n`);
  });

// ─── Security ─────────────────────────────────────────────
const security = program
  .command('security')
  .description('Security management');

security
  .command('audit')
  .description('Run a comprehensive security audit')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (opts) => {
    console.log('');
    console.log('🔒 AI_DESK Security Audit');
    console.log('═'.repeat(50));

    const { config, warnings } = loadConfig(opts.config);
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const engine = new AuditEngine(config, dataDir);
    const { results, score, passed, warned, failed } = await engine.runFullAudit();

    // Print results by category
    const categories = [...new Set(results.map(r => r.category))];

    for (const cat of categories) {
      console.log(`\n  📋 ${cat.toUpperCase()}`);
      const catResults = results.filter(r => r.category === cat);
      for (const r of catResults) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️ ' : '❌';
        console.log(`     ${icon} ${r.name}`);
        console.log(`        ${r.detail}`);
      }
    }

    // Print warnings
    if (warnings.length > 0) {
      console.log('\n  ⚠️  CONFIG WARNINGS:');
      for (const w of warnings) {
        console.log(`     ${w}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log(`  Score: ${score}% | ✅ ${passed} passed | ⚠️  ${warned} warnings | ❌ ${failed} failed`);

    if (failed > 0) {
      console.log('  🔴 ACTION REQUIRED: Fix failed checks before production use.');
    } else if (warned > 0) {
      console.log('  🟡 Review warnings for optimal security.');
    } else {
      console.log('  🟢 All checks passed. Gateway is secure.');
    }
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
  });

// ─── Token Management ─────────────────────────────────────
const token = program
  .command('token')
  .description('Auth token management');

token
  .command('create')
  .description('Create a new auth token')
  .option('-l, --label <label>', 'Token label', 'default')
  .action((opts) => {
    const { config } = loadConfig();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';

    if (!masterKey) {
      console.error('❌ AI_DESK_MASTER_KEY is required');
      process.exit(1);
    }

    const auth = new AuthManager(config.gateway.auth, dataDir, masterKey);
    const { id, token: rawToken } = auth.generateToken(opts.label);

    console.log(`\n🔑 Token created:`);
    console.log(`   ID:    ${id}`);
    console.log(`   Label: ${opts.label}`);
    console.log(`   Token: ${rawToken}`);
    console.log(`\n   Save this token — it will not be shown again.\n`);

    auth.destroy();
  });

token
  .command('list')
  .description('List all auth tokens')
  .action(() => {
    const { config } = loadConfig();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';

    if (!masterKey) {
      console.error('❌ AI_DESK_MASTER_KEY is required');
      process.exit(1);
    }

    const auth = new AuthManager(config.gateway.auth, dataDir, masterKey);
    const tokens = auth.listTokens();

    console.log(`\n🔑 Auth Tokens (${tokens.length}):\n`);

    if (tokens.length === 0) {
      console.log('   No tokens found. Create one with: ai-desk token create\n');
    } else {
      for (const t of tokens) {
        const status = t.revoked ? '🔴 revoked' : t.expired ? '🟡 expired' : '🟢 active';
        console.log(`   ${status} [${t.id}] ${t.label}`);
        console.log(`      Created: ${new Date(t.createdAt).toISOString()}`);
        console.log(`      Expires: ${new Date(t.expiresAt).toISOString()}`);
        if (t.lastUsedAt) {
          console.log(`      Last used: ${new Date(t.lastUsedAt).toISOString()}`);
        }
        console.log('');
      }
    }

    auth.destroy();
  });

token
  .command('revoke <tokenId>')
  .description('Revoke an auth token')
  .action((tokenId) => {
    const { config } = loadConfig();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';

    if (!masterKey) {
      console.error('❌ AI_DESK_MASTER_KEY is required');
      process.exit(1);
    }

    const auth = new AuthManager(config.gateway.auth, dataDir, masterKey);
    const revoked = auth.revokeToken(tokenId);

    if (revoked) {
      console.log(`\n✅ Token ${tokenId} revoked.\n`);
    } else {
      console.log(`\n❌ Token ${tokenId} not found.\n`);
    }

    auth.destroy();
  });

// ─── Config ───────────────────────────────────────────────
program
  .command('config')
  .description('Config management')
  .command('validate')
  .description('Validate the current configuration')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action((opts) => {
    try {
      const { config, warnings, source } = loadConfig(opts.config);
      console.log(`\n✅ Config valid (loaded from: ${source})`);

      if (warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        for (const w of warnings) {
          console.log(`   ${w}`);
        }
      }

      console.log(`\n   Gateway:    ${config.gateway.bind}:${config.gateway.port}`);
      console.log(`   Auth:       ${config.gateway.auth.mode}`);
      console.log(`   Sandbox:    ${config.agents.defaults.sandbox.mode}`);
      console.log(`   Tools:      ${config.agents.defaults.tools.profile}`);
      console.log(`   Model:      ${config.agents.defaults.model.primary}`);
      console.log(`   Agents:     ${config.agents.list.length}`);
      console.log('');
    } catch (err) {
      console.error(`\n❌ Config invalid: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

// ─── Agent ────────────────────────────────────────────────
const agent = program
  .command('agent')
  .description('Agent runtime commands (Phase 2)');

agent
  .command('test <prompt>')
  .description('Run the agent loop one-shot from the CLI (no gateway needed)')
  .option('-a, --agent <id>', 'Agent id', 'main')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .option('--max-steps <n>', 'Max steps', '10')
  .action(async (prompt, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const providers = router.status();
    const available = providers.filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const compactor = new ContextCompactor(router, config.memory ?? {
      backend: 'none',
      compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
    });
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({
      policy, registry, sandbox, threat,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: async () => {
        console.log('   (auto-denying tool approval in CLI mode)');
        return false;
      },
    });
    const subagents = new SubagentSpawner({
      router, executor, budget, compactor, policy,
      defaults: config.agents.defaults.subagents,
    });
    const runtime = new AgentRuntime({
      router, cache, budget, compactor, executor, subagents,
      sessions, threat,
      defaults: config.agents.defaults,
      agents: config.agents.list,
    });

    console.log(`\n🤖 Running agent "${opts.agent}"...\n`);

    const result = await runtime.run({
      userMessage: prompt,
      agentId: opts.agent,
      channelId: 'cli',
      peerId: 'cli',
      maxSteps: parseInt(opts.maxSteps, 10),
      onProgress: (e) => {
        if (e.type === 'thinking') process.stdout.write('   💭 thinking...\n');
        if (e.type === 'tool_use') process.stdout.write(`   🔧 tool: ${e.toolName}\n`);
        if (e.type === 'tool_result') process.stdout.write(`   ✅ result (${e.durationMs}ms)\n`);
        if (e.type === 'cache_hit') process.stdout.write(`   ⚡ cache hit (saved ~${e.tokensSaved} tokens)\n`);
        if (e.type === 'compaction') process.stdout.write(`   📦 compacted ${e.messagesBefore}→${e.messagesAfter}\n`);
        if (e.type === 'budget_warning') process.stdout.write(`   ⚠️  budget ${e.period} ${(e.pctUsed*100).toFixed(0)}%\n`);
      },
    });

    console.log('\n─── Result ─────────────────────────────────');
    if (result.success) {
      console.log(result.content);
    } else {
      console.log(`❌ ${result.error}`);
      if (result.content) console.log(`Last partial: ${result.content}`);
    }
    console.log('─────────────────────────────────────────────');
    console.log(`Model: ${result.model || 'n/a'} | Steps: ${result.steps} | Cached: ${result.cached}`);
    console.log(`Tokens: in=${result.tokensUsed.input} out=${result.tokensUsed.output} total=${result.tokensUsed.total}`);
    console.log(`Cost:   $${result.tokensUsed.cost.toFixed(6)} | Duration: ${result.durationMs}ms\n`);

    sessions.close_db();
    budget.close();
    cache.close();
    process.exit(result.success ? 0 : 1);
  });

agent
  .command('list')
  .description('List configured agents')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action((opts) => {
    const { config } = loadConfig(opts.config);
    console.log('\n🤖 Agents:\n');
    for (const a of config.agents.list) {
      const def = a.default ? ' [default]' : '';
      console.log(`   ${a.id}${def}`);
      console.log(`      workspace: ${a.workspace}`);
      console.log(`      model:     ${a.model?.primary ?? config.agents.defaults.model.primary}`);
      console.log('');
    }
  });

// ─── Budget ───────────────────────────────────────────────
const budgetCmd = program
  .command('budget')
  .description('Budget management');

budgetCmd
  .command('show')
  .description('Show current budget usage')
  .option('-a, --agent <id>', 'Agent id', 'main')
  .action((opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const tracker = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const status = tracker.status(opts.agent);

    console.log(`\n💰 Budget — agent "${opts.agent}":\n`);
    console.log(`   Status:  ${status.paused ? '🔴 PAUSED' : '🟢 active'}`);
    console.log(`   Daily:   ${status.daily.tokens.toLocaleString()} / ${status.daily.limit.toLocaleString()} tokens` +
                ` (${(status.daily.tokens/Math.max(status.daily.limit,1)*100).toFixed(1)}%)`);
    console.log(`            $${status.daily.cost.toFixed(4)} cost`);
    console.log(`   Monthly: ${status.monthly.tokens.toLocaleString()} / ${status.monthly.limit.toLocaleString()} tokens` +
                ` (${(status.monthly.tokens/Math.max(status.monthly.limit,1)*100).toFixed(1)}%)`);
    console.log(`            $${status.monthly.cost.toFixed(4)} cost\n`);

    tracker.close();
  });

budgetCmd
  .command('resume <agentId>')
  .description('Resume a paused agent')
  .action((agentId) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const tracker = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const ok = tracker.resume(agentId);
    console.log(ok
      ? `\n✅ Agent "${agentId}" resumed.\n`
      : `\n⚠️  Agent "${agentId}" was not paused.\n`);
    tracker.close();
  });

// ─── Cache ────────────────────────────────────────────────
const cacheCmd = program
  .command('cache')
  .description('Response cache management');

cacheCmd
  .command('stats')
  .description('Show cache statistics')
  .action(() => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const stats = cache.stats();
    console.log('\n⚡ Response Cache:\n');
    console.log(`   Enabled:        ${config.cache?.enabled ?? true}`);
    console.log(`   Entries stored: ${stats.entries}`);
    console.log(`   Session hits:   ${stats.hits}`);
    console.log(`   Session misses: ${stats.misses}`);
    console.log(`   Hit rate:       ${(stats.hitRate*100).toFixed(1)}%`);
    console.log(`   Tokens saved:   ${stats.totalTokensSaved.toLocaleString()}`);
    console.log(`   Cost saved:     $${stats.totalCostSaved.toFixed(4)}\n`);
    cache.close();
  });

cacheCmd
  .command('clear')
  .description('Clear all cache entries')
  .action(() => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const removed = cache.clear();
    console.log(`\n🧹 Cleared ${removed} cache entries.\n`);
    cache.close();
  });

cacheCmd
  .command('purge')
  .description('Purge expired cache entries only')
  .action(() => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const removed = cache.purgeExpired();
    console.log(`\n🧹 Purged ${removed} expired entries.\n`);
    cache.close();
  });

// ─── Models ───────────────────────────────────────────────
program
  .command('models')
  .description('List configured model providers')
  .action(() => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig();
    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    console.log('\n🧠 Model Providers:\n');
    for (const p of router.status()) {
      const status = p.available ? '🟢 available' : '🔴 missing API key';
      console.log(`   ${status}  ${p.name}`);
      console.log(`      models: ${p.models.join(', ')}`);
      console.log('');
    }
    console.log(`   Primary:    ${config.agents.defaults.model.primary}`);
    console.log(`   Failover:   ${(config.agents.defaults.model.failover ?? []).join(' → ') || '(none)'}`);
    console.log(`   Sub-agent:  ${config.agents.defaults.subagents.model} (forced)\n`);
  });

// ─── Skill Management ─────────────────────────────────────
const skillCmd = program
  .command('skill')
  .description('Skills ecosystem — manage capability bundles');

skillCmd
  .command('list')
  .description('List all discovered skills and their status')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();
    const skills = registry.list();

    console.log(`\n🎯 Skills (${skills.length} found):\n`);

    if (skills.length === 0) {
      console.log('   No skills found. Add *.skill.json files to the skills/ directory.\n');
      return;
    }

    for (const s of skills) {
      const icon = s.state.enabled ? '🟢' : '⚫';
      const tags = s.definition.tags?.length ? ` [${s.definition.tags.join(', ')}]` : '';
      console.log(`   ${icon} ${s.definition.name} v${s.definition.version}${tags}`);
      console.log(`      ${s.definition.description}`);
      if (s.definition.mcpServer) {
        console.log(`      MCP: ${s.definition.mcpServer.command} ${(s.definition.mcpServer.args ?? []).join(' ')}`);
      }
      if (s.definition.toolAllowlist?.length) {
        console.log(`      Tools: ${s.definition.toolAllowlist.join(', ')}`);
      }
      console.log('');
    }
    console.log('   Use: skill enable <name> / skill disable <name>\n');
  });

skillCmd
  .command('enable <name>')
  .description('Enable a skill')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();
    const ok = registry.enable(name);
    if (ok) {
      const skill = registry.get(name)!;
      console.log(`\n✅ Skill "${name}" enabled.`);
      if (skill.definition.toolAllowlist?.length) {
        console.log(`   Tools now allowed: ${skill.definition.toolAllowlist.join(', ')}`);
      }
      if (skill.definition.mcpServer) {
        console.log(`   MCP server will start on next gateway launch.`);
      }
      console.log('   Restart gateway to apply.\n');
    } else {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('disable <name>')
  .description('Disable a skill')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();
    const ok = registry.disable(name);
    console.log(ok
      ? `\n✅ Skill "${name}" disabled. Restart gateway to apply.\n`
      : `\n❌ Skill "${name}" not found.\n`);
    if (!ok) process.exit(1);
  });

skillCmd
  .command('info <name>')
  .description('Show full details of a skill')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();
    const skill = registry.get(name);
    if (!skill) {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }
    const d = skill.definition;
    const enabled = skill.state.enabled;
    console.log(`\n🎯 ${d.name} v${d.version} — ${enabled ? '🟢 enabled' : '⚫ disabled'}\n`);
    console.log(`   Description: ${d.description}`);
    if (d.author) console.log(`   Author:      ${d.author}`);
    if (d.tags?.length) console.log(`   Tags:        ${d.tags.join(', ')}`);
    if (d.toolAllowlist?.length) console.log(`   Tools:       ${d.toolAllowlist.join(', ')}`);
    if (d.systemPromptAddition) {
      console.log(`\n   System prompt addition:\n   ${d.systemPromptAddition.split('\n').join('\n   ')}`);
    }
    if (d.mcpServer) {
      console.log(`\n   MCP Server:`);
      console.log(`      command: ${d.mcpServer.command}`);
      if (d.mcpServer.args?.length) console.log(`      args:    ${d.mcpServer.args.join(' ')}`);
      if (d.mcpServer.env) console.log(`      env:     ${Object.keys(d.mcpServer.env).join(', ')}`);
      console.log(`      sandbox: ${d.mcpServer.sandbox}`);
    }
    console.log('');
  });

// ─── Serve MCP (AI_DESK as MCP Server) ───────────────────
program
  .command('serve-mcp')
  .description('Expose AI_DESK as an MCP server over stdio (for Claude Code / Claude Desktop)')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    // Build minimal runtime for MCP server (no gateway, no WebSocket)
    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const compactor = new ContextCompactor(router, config.memory ?? {
      backend: 'none',
      compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
    });
    const toolRegistry = new ToolRegistry();
    const executor = new ToolExecutor({
      policy, registry: toolRegistry, sandbox, threat,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: async () => true, // MCP context: auto-approve (policy already checked)
    });
    const subagents = new SubagentSpawner({
      router, executor, budget, compactor, policy,
      defaults: config.agents.defaults.subagents,
    });

    // Init skill registry
    const skillRegistry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await skillRegistry.init();
    const skillAllowlist = skillRegistry.toolAllowlist();
    if (skillAllowlist.length > 0) policy.setSkillAllowlist(skillAllowlist);

    const runtime = new AgentRuntime({
      router, cache, budget, compactor, executor, subagents,
      sessions, threat,
      defaults: config.agents.defaults,
      agents: config.agents.list,
      systemPromptProvider: () => skillRegistry.composedSystemPrompt(),
    });

    const defaultAgent = config.agents.list.find(a => a.default) ?? config.agents.list[0];

    const server = new McpServer({
      tools: toolRegistry,
      policy,
      runtime,
      skills: skillRegistry,
      defaultAgentId: defaultAgent?.id ?? 'main',
    });

    server.serve();

    // Keep alive — MCP server runs until stdio closes
    process.on('SIGINT', () => {
      sessions.close_db();
      budget.close();
      cache.close();
      process.exit(0);
    });
  });

// ─── Messaging ────────────────────────────────────────────
const messagingCmd = program
  .command('messaging')
  .description('Messaging adapter management (Telegram / Discord)');

messagingCmd
  .command('status')
  .description('Show configured messaging adapters and their token env vars')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action((opts) => {
    const { config } = loadConfig(opts.config);
    const msg = config.messaging;

    console.log('\n💬 Messaging Adapters:\n');

    if (!msg) {
      console.log('   No messaging config found in ai-desk.json');
      console.log('   Add a "messaging" block to enable Telegram / Discord.\n');
      return;
    }

    if (msg.telegram) {
      const tokenSet = !!process.env.TELEGRAM_BOT_TOKEN;
      const icon = msg.telegram.enabled ? (tokenSet ? '🟢' : '🔴') : '⚫';
      console.log(`   ${icon} Telegram`);
      console.log(`      enabled:    ${msg.telegram.enabled}`);
      console.log(`      token:      ${tokenSet ? 'set (TELEGRAM_BOT_TOKEN)' : '⚠️  TELEGRAM_BOT_TOKEN not set'}`);
      console.log(`      agentId:    ${msg.telegram.agentId ?? '(default)'}`);
      const allowedChats = msg.telegram.allowedChatIds ?? [];
      console.log(`      allowlist:  ${allowedChats.length > 0 ? allowedChats.join(', ') : '(all chats)'}`);
      console.log('');
    }

    if (msg.discord) {
      const tokenSet = !!process.env.DISCORD_BOT_TOKEN;
      const icon = msg.discord.enabled ? (tokenSet ? '🟢' : '🔴') : '⚫';
      console.log(`   ${icon} Discord`);
      console.log(`      enabled:    ${msg.discord.enabled}`);
      console.log(`      token:      ${tokenSet ? 'set (DISCORD_BOT_TOKEN)' : '⚠️  DISCORD_BOT_TOKEN not set'}`);
      console.log(`      agentId:    ${msg.discord.agentId ?? '(default)'}`);
      console.log(`      prefix:     ${msg.discord.prefix ?? '(mention only)'}`);
      const guilds = msg.discord.allowedGuildIds ?? [];
      const channels = msg.discord.allowedChannelIds ?? [];
      console.log(`      guilds:     ${guilds.length > 0 ? guilds.join(', ') : '(all guilds)'}`);
      console.log(`      channels:   ${channels.length > 0 ? channels.join(', ') : '(all channels)'}`);
      console.log('');
    }
  });

messagingCmd
  .command('start')
  .description('Start messaging adapters standalone (without full gateway — for testing)')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action(async (opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    if (!config.messaging) {
      console.error('\n❌ No messaging config in ai-desk.json\n');
      process.exit(1);
    }

    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model);
    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const compactor = new ContextCompactor(router, config.memory ?? {
      backend: 'none',
      compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
    });
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({
      policy, registry, sandbox, threat,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: async () => false,
    });
    const subagents = new SubagentSpawner({
      router, executor, budget, compactor, policy,
      defaults: config.agents.defaults.subagents,
    });
    const runtime = new AgentRuntime({
      router, cache, budget, compactor, executor, subagents,
      sessions, threat,
      defaults: config.agents.defaults,
      agents: config.agents.list,
    });

    const defaultAgent = config.agents.list.find(a => a.default) ?? config.agents.list[0];
    const manager = new MessagingManager({
      config: config.messaging,
      runtime,
      threat,
      defaultAgentId: defaultAgent?.id ?? 'main',
    });

    console.log('\n💬 Starting messaging adapters...\n');
    const statuses = await manager.startAll();
    for (const s of statuses) {
      console.log(`   ${s.running ? '🟢' : '🔴'} ${s.platform}`);
    }

    const running = statuses.filter(s => s.running);
    if (running.length === 0) {
      console.error('\n❌ No adapters started. Check tokens and config.\n');
      process.exit(1);
    }

    console.log(`\n✅ ${running.length} adapter(s) running. Press Ctrl+C to stop.\n`);

    const shutdown = async () => {
      console.log('\n🛑 Stopping...');
      await manager.stopAll();
      sessions.close_db();
      budget.close();
      cache.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep alive
    await new Promise(() => {});
  });

// ─── MCP ──────────────────────────────────────────────────
const mcpCmd = program
  .command('mcp')
  .description('MCP server management (Phase 3)');

mcpCmd
  .command('list')
  .description('List configured MCP servers and their tools')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action(async (opts) => {
    const { config } = loadConfig(opts.config);

    if (!config.mcp || Object.keys(config.mcp.servers).length === 0) {
      console.log('\n🔌 No MCP servers configured in ai-desk.json\n');
      console.log('   Add an "mcp" block to your config to connect external tools.\n');
      return;
    }

    console.log('\n🔌 MCP Servers:\n');

    const { config: cfg } = loadConfig(opts.config);
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const budgetCfg = cfg.agents.defaults.budget;

    // We need a dummy BudgetTracker just to instantiate McpRegistry
    const budget = new BudgetTracker(dataDir, budgetCfg);
    const registry = new McpRegistry(config.mcp, budget);

    console.log('   Connecting to servers...\n');
    const statuses = await registry.startAll();

    for (const s of statuses) {
      const icon = s.ready ? '🟢' : '🔴';
      console.log(`   ${icon} ${s.name} — ${s.toolCount} tool(s) ${s.error ? `(${s.error})` : ''}`);
    }

    const tools = registry.getRegisteredTools();
    if (tools.length > 0) {
      console.log('\n   Available tools:\n');
      for (const t of tools) {
        console.log(`   [${t.serverName}] ${t.tool.name}`);
        if (t.tool.description) console.log(`      ${t.tool.description}`);
      }
    }

    await registry.stopAll();
    budget.close();
    console.log('');
  });

mcpCmd
  .command('test <serverName>')
  .description('Test connection to a specific MCP server')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action(async (serverName, opts) => {
    const { config } = loadConfig(opts.config);

    if (!config.mcp?.servers[serverName]) {
      console.error(`\n❌ MCP server "${serverName}" not found in config\n`);
      process.exit(1);
    }

    const serverCfg = config.mcp.servers[serverName];
    console.log(`\n🔌 Testing MCP server: ${serverName}`);
    console.log(`   Command: ${serverCfg.command} ${(serverCfg.args ?? []).join(' ')}\n`);

    const client = new McpClient({
      name: serverName,
      command: serverCfg.command,
      args: serverCfg.args,
      env: serverCfg.env,
    });

    try {
      const t0 = Date.now();
      await client.start();
      const handshakeMs = Date.now() - t0;
      console.log(`   ✅ Connected (handshake: ${handshakeMs}ms)`);

      const tools = await client.listTools();
      console.log(`   ✅ Tools discovered: ${tools.length}`);
      for (const t of tools) {
        console.log(`      • ${t.name}: ${t.description}`);
      }

      await client.stop();
      console.log(`   ✅ Clean shutdown\n`);
    } catch (err) {
      console.error(`   ❌ ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── Orchestrate ──────────────────────────────────────────
const orchestrateCmd = program
  .command('orchestrate')
  .description('Multi-agent orchestration (Phase 3)');

orchestrateCmd
  .command('run <tasksJson>')
  .description('Run a task graph (JSON array of task definitions) across multiple agents')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .option('--max-concurrent <n>', 'Max parallel tasks', '5')
  .option('--fail-fast', 'Stop on first failure', false)
  .action(async (tasksJson, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    let tasks: TaskDefinition[];
    try {
      tasks = JSON.parse(tasksJson);
      if (!Array.isArray(tasks)) throw new Error('tasks must be an array');
    } catch (err) {
      console.error(`\n❌ Invalid tasks JSON: ${(err as Error).message}\n`);
      process.exit(1);
    }

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const available = router.status().filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const compactor = new ContextCompactor(router, config.memory ?? {
      backend: 'none',
      compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
    });
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({
      policy, registry, sandbox, threat,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: async () => false,
    });
    const subagents = new SubagentSpawner({
      router, executor, budget, compactor, policy,
      defaults: config.agents.defaults.subagents,
    });
    const runtime = new AgentRuntime({
      router, cache, budget, compactor, executor, subagents,
      sessions, threat,
      defaults: config.agents.defaults,
      agents: config.agents.list,
    });

    const orchestrator = new Orchestrator(runtime);

    console.log(`\n🎯 Orchestrating ${tasks.length} task(s), max ${opts.maxConcurrent} concurrent\n`);
    const t0 = Date.now();

    const result = await orchestrator.run({
      tasks,
      maxConcurrent: parseInt(opts.maxConcurrent, 10),
      failFast: opts.failFast,
      channelId: 'cli',
      peerId: 'cli',
    });

    console.log('\n─── Orchestration Result ───────────────────');
    console.log(result.summary);
    console.log('─────────────────────────────────────────────');
    console.log(`Done: ${result.doneCount} | Failed: ${result.failedCount} | Skipped: ${result.skippedCount}`);
    console.log(`Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

    sessions.close_db();
    budget.close();
    cache.close();
    process.exit(result.success ? 0 : 1);
  });

// ─── Team ─────────────────────────────────────────────────
const teamCmd = program
  .command('team')
  .description('Multi-agent team management (Phase Paperclip)');

teamCmd
  .command('list')
  .description('List configured teams and their members')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action((opts) => {
    const { config } = loadConfig(opts.config);
    const tc = config.teams;

    console.log('\n👥 Teams:\n');

    if (!tc || tc.teams.length === 0) {
      console.log('   No teams configured. Add a "teams" block to ai-desk.json.\n');
      return;
    }

    const roleMap = new Map((tc.roles ?? []).map(r => [r.id, r]));

    for (const t of tc.teams) {
      console.log(`   ${t.id} — ${t.name}`);
      console.log(`      Lead:    ${t.leadAgentId}`);
      if (t.sharedGoal) console.log(`      Goal:    ${t.sharedGoal}`);
      console.log(`      Members: ${t.members.length}`);
      for (const m of t.members) {
        const role = roleMap.get(m.roleId);
        console.log(`        • ${m.agentId} (${role?.name ?? m.roleId})`);
      }
      console.log('');
    }
  });

teamCmd
  .command('run <teamId> <goal>')
  .description('Run a team on a goal and print the synthesised result')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action(async (teamId, goal, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    if (!config.teams || config.teams.teams.length === 0) {
      console.error('\n❌ No teams configured in ai-desk.json\n');
      process.exit(1);
    }

    const teamDef = config.teams.teams.find(t => t.id === teamId);
    if (!teamDef) {
      console.error(`\n❌ Team "${teamId}" not found\n`);
      process.exit(1);
    }

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const available = router.status().filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const compactor = new ContextCompactor(router, config.memory ?? {
      backend: 'none',
      compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
    });
    const registry = new ToolRegistry();
    const executor = new ToolExecutor({
      policy, registry, sandbox, threat,
      sandboxConfig: config.agents.defaults.sandbox,
      requestApproval: async () => false,
    });
    const subagents = new SubagentSpawner({
      router, executor, budget, compactor, policy,
      defaults: config.agents.defaults.subagents,
    });
    const runtime = new AgentRuntime({
      router, cache, budget, compactor, executor, subagents,
      sessions, threat,
      defaults: config.agents.defaults,
      agents: config.agents.list,
    });

    const { TeamCoordinator } = await import('../roles/team-coordinator.js');
    const coordinator = new TeamCoordinator({
      runtime,
      roles: config.teams.roles,
      teams: config.teams.teams,
    });

    console.log(`\n👥 Running team "${teamDef.name}" on goal:\n   ${goal}\n`);
    const t0 = Date.now();

    const result = await coordinator.run(teamId, goal);

    console.log('\n─── Team Result ────────────────────────────');
    console.log(result.synthesis);
    console.log('─────────────────────────────────────────────');
    const icon = result.success ? '✅' : '⚠️ ';
    console.log(`${icon} Done: ${result.doneCount}/${result.taskCount} | Failed: ${result.failedCount} | ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

    sessions.close_db();
    budget.close();
    cache.close();
    process.exit(result.success ? 0 : 1);
  });

// ─── Role ─────────────────────────────────────────────────
const roleCmd = program
  .command('role')
  .description('Agent role management');

roleCmd
  .command('list')
  .description('List configured roles')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action((opts) => {
    const { config } = loadConfig(opts.config);
    const tc = config.teams;

    console.log('\n🎭 Roles:\n');

    if (!tc || tc.roles.length === 0) {
      console.log('   No roles configured. Add a "teams.roles" array to ai-desk.json.\n');
      return;
    }

    for (const r of tc.roles) {
      console.log(`   ${r.id} — ${r.name}`);
      console.log(`      ${r.description}`);
      if (r.canDelegateTo?.length) console.log(`      Can delegate to: ${r.canDelegateTo.join(', ')}`);
      if (r.systemPromptPrefix) {
        const preview = r.systemPromptPrefix.slice(0, 80).replace(/\n/g, ' ');
        console.log(`      Prompt prefix: "${preview}${r.systemPromptPrefix.length > 80 ? '…' : ''}"`);
      }
      console.log('');
    }
  });

function requireMasterKey(): string {
  const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';
  if (!masterKey) {
    console.error('❌ AI_DESK_MASTER_KEY is required');
    process.exit(1);
  }
  return masterKey;
}

program.parse();
