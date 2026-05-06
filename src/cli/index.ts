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
import { MemoryStore } from '../memory/memory-store.js';
import { SkillTraceStore } from '../memory/skill-trace-store.js';
import { SkillRateLimiter } from '../skills/skill-rate-limit.js';
import { SkillSynthesizer } from '../skills/skill-synthesizer.js';
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
    const memoryCfg = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore = memoryCfg.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg, memoryStore);
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
      memoryStore,
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
  .command('list-generated')
  .description('List generated (synthesized) skills and their approval status')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const generated = registry.listGenerated();

    console.log(`\n🔬 Generated Skills (${generated.length}):\n`);
    if (generated.length === 0) {
      console.log('   No generated skills found. Run: ai-desk skill synthesize --from-session <id>\n');
      return;
    }

    for (const s of generated) {
      const pending = s.state.pendingApproval ? '⏳ pending' : s.state.enabled ? '🟢 enabled' : '⚫ disabled';
      const d = s.definition;
      console.log(`   ${pending}  ${d.name} v${d.version}`);
      console.log(`      ${d.description}`);
      if (d.sourceSessionId) console.log(`      Session: ${d.sourceSessionId}`);
      if (d.tags?.length) console.log(`      Tags:    ${d.tags.join(', ')}`);
      const m = s.state.metrics;
      if (m && m.uses > 0) {
        const rate = ((m.successes / m.uses) * 100).toFixed(0);
        console.log(`      Metrics: ${m.uses} uses, ${rate}% success`);
      }
      console.log('');
    }
  });

skillCmd
  .command('synthesize')
  .description('Synthesize a new skill from a recorded session trace')
  .requiredOption('--from-session <id>', 'Session ID to synthesize from')
  .option('--dry-run', 'Preview output without writing to disk', false)
  .option('--negative', 'Synthesize an anti-skill (kind="avoid") from a failure trace', false)
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);
    const synthCfg = config.skillSynthesis ?? {
      model: 'anthropic/claude-sonnet-4-6',
      improvementModel: 'anthropic/claude-sonnet-4-6',
      scrubModel: 'anthropic/claude-haiku-4-5',
      fallbackToHaikuUnderBudget: true,
      maxPerDay: 5,
      minGapMinutes: 15,
      autoTriggerMinToolCalls: 8,
      failureRateThreshold: 0.4,
      minUsesBeforeImprovement: 30,
      ttlDays: 60,
      maxEnabledPerAgent: 15,
      maxGeneratedTotal: 50,
      deprecateAfterNegativeUses: 10,
    };

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const available = router.status().filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const traceStore = new SkillTraceStore(dataDir);
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const rateLimiter = new SkillRateLimiter(dataDir, { maxPerDay: synthCfg.maxPerDay, minGapMinutes: synthCfg.minGapMinutes });

    const synthesizer = new SkillSynthesizer({
      traceStore, registry, router, budget, rateLimiter, config: synthCfg,
      outputDir: generatedDir,
    });

    const synthesisKind = opts.negative ? 'avoid' : 'positive';
    console.log(`\n🔬 ${opts.dryRun ? '[DRY RUN] ' : ''}Synthesizing ${synthesisKind === 'avoid' ? 'anti-skill' : 'skill'} from session: ${opts.fromSession}\n`);

    const result = await synthesizer.synthesize([opts.fromSession], {
      dryRun: opts.dryRun,
      agentId: 'cli',
      projectRoot: process.cwd(),
      synthesisKind,
    });

    if (result.rateLimited) {
      console.error(`❌ Rate limited: ${result.errors?.join('\n')}\n`);
      budget.close();
      process.exit(1);
    }
    if (result.budgetBlocked) {
      console.error(`❌ Budget blocked: ${result.errors?.join('\n')}\n`);
      budget.close();
      process.exit(1);
    }
    if (result.errors?.length) {
      console.error(`❌ Synthesis failed:\n${result.errors.join('\n')}\n`);
      budget.close();
      process.exit(1);
    }
    if (result.isDuplicate) {
      console.log(`⚠️  Similar skill already exists: ${result.duplicateOf}`);
      console.log(`   Generated skill was not saved (high similarity detected).\n`);
      budget.close();
      return;
    }

    const d = result.skill!;
    const kindLabel = d.kind === 'avoid' ? 'Anti-skill' : 'Skill';
    console.log(`✅ ${kindLabel} synthesized: ${d.name} v${d.version}`);
    console.log(`   ${d.description}`);
    if (d.tags?.length) console.log(`   Tags: ${d.tags.join(', ')}`);
    if (d.toolAllowlist?.length) console.log(`   Tools: ${d.toolAllowlist.join(', ')}`);
    if (d.kind === 'avoid') console.log(`   Kind: avoid (cautionary — injected in AVOID block)`);
    if (result.filePath) console.log(`   Written to: ${result.filePath}`);
    if (result.dryRun) {
      console.log('\n   [DRY RUN] Skill was NOT written to disk or registered.');
      console.log('   Remove --dry-run to save it.\n');
    } else {
      console.log('\n   Skill is pending approval. Run:');
      console.log(`     ai-desk skill review ${d.name}`);
      console.log(`     ai-desk skill approve ${d.name}\n`);
    }

    budget.close();
  });

skillCmd
  .command('review <name>')
  .description('Review a generated skill definition and show diff vs parent')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const skill = registry.get(name);
    if (!skill) {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }

    const d = skill.definition;
    const state = skill.state;
    const statusStr = state.pendingApproval ? '⏳ pending approval'
      : state.enabled ? '🟢 enabled' : '⚫ disabled';

    console.log(`\n🔬 Skill Review: ${d.name} v${d.version} — ${statusStr}\n`);
    console.log(`   Description:   ${d.description}`);
    console.log(`   Provenance:    ${d.provenance ?? 'builtin'}`);
    if (d.tags?.length) console.log(`   Tags:          ${d.tags.join(', ')}`);
    if (d.toolAllowlist?.length) console.log(`   Tools allowed: ${d.toolAllowlist.join(', ')}`);
    if (d.sourceSessionId) console.log(`   Source session: ${d.sourceSessionId}`);
    if (d.modelId) console.log(`   Synthesized by: ${d.modelId}`);
    if (d.createdAt) console.log(`   Created:        ${new Date(d.createdAt).toISOString()}`);
    if (d.systemPromptAddition) {
      console.log(`\n   System prompt addition:\n   ${'─'.repeat(50)}`);
      for (const line of d.systemPromptAddition.split('\n')) {
        console.log(`   ${line}`);
      }
      console.log(`   ${'─'.repeat(50)}`);
    }

    if (d.parentSkill) {
      const parent = registry.get(d.parentSkill);
      if (parent) {
        console.log(`\n   Parent skill: ${d.parentSkill} (revision ${parent.definition.revision ?? 1} → ${d.revision})`);
        if (parent.definition.systemPromptAddition !== d.systemPromptAddition) {
          console.log('   System prompt changed (diff):');
          console.log('   [parent] ' + (parent.definition.systemPromptAddition ?? '').slice(0, 100));
          console.log('   [this  ] ' + (d.systemPromptAddition ?? '').slice(0, 100));
        }
      }
    }

    const m = state.metrics;
    if (m && m.uses > 0) {
      const rate = ((m.successes / m.uses) * 100).toFixed(0);
      console.log(`\n   Metrics: ${m.uses} uses, ${rate}% success rate`);
      if (m.avgTokensSaved !== undefined) {
        console.log(`   Avg tokens saved: ${m.avgTokensSaved.toFixed(0)} per session`);
      }
    }

    if (state.pendingApproval) {
      console.log(`\n   To approve: ai-desk skill approve ${d.name}`);
      console.log(`   To reject:  ai-desk skill reject ${d.name}\n`);
    }
    console.log('');
  });

skillCmd
  .command('approve <name>')
  .description('Approve a pending generated skill (enables it)')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const ok = registry.approve(name, { connectionId: 'cli' });
    if (ok) {
      console.log(`\n✅ Skill "${name}" approved and enabled. Restart gateway to apply.\n`);
    } else {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('reject <name>')
  .description('Reject a pending generated skill (keeps disabled)')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const ok = registry.reject(name, { connectionId: 'cli' });
    if (ok) {
      console.log(`\n✅ Skill "${name}" rejected.\n`);
    } else {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('archive <name>')
  .description('Archive a skill (removes from registry)')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();
    const ok = registry.archive(name, { connectionId: 'cli' });
    if (ok) {
      console.log(`\n✅ Skill "${name}" archived.\n`);
    } else {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('revert <name>')
  .description('Revert a skill to a previous revision (Phase 5 feature)')
  .option('--to-revision <n>', 'Revision number to revert to')
  .action((name, opts) => {
    console.log(`\n⚠️  skill revert is not yet implemented (Phase 5).`);
    console.log(`   Planned: revert "${name}" to revision ${opts.toRevision ?? '?'}\n`);
  });

skillCmd
  .command('improve')
  .description('Check enabled skills for improvement candidates and optionally trigger revisions')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .option('--name <skillName>', 'Improve a specific skill by name (default: all candidates)')
  .option('--dry-run', 'Show what would be revised without writing files', false)
  .option('--output-dir <path>', 'Output directory for revised skills', 'skills/generated')
  .action(async (opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { SkillImprover } = await import('../skills/skill-improver.js');
    const { SkillTraceStore } = await import('../memory/skill-trace-store.js');
    const { SkillRateLimiter } = await import('../skills/skill-rate-limit.js');
    const { ModelRouter } = await import('../models/model-router.js');
    const { CredentialStore } = await import('../auth/credential-store.js');
    const { BudgetTracker } = await import('../budget/budget-tracker.js');
    const { loadConfig } = await import('../config/config-loader.js');

    const masterKey = process.env.AI_DESK_MASTER_KEY ?? 'dev-key';
    const { config } = loadConfig(process.env.AI_DESK_CONFIG ?? 'ai-desk.json');
    const synthConfig = config.skillSynthesis ?? {
      model: 'anthropic/claude-sonnet-4-6',
      improvementModel: 'anthropic/claude-sonnet-4-6',
      scrubModel: 'anthropic/claude-haiku-4-5',
      fallbackToHaikuUnderBudget: false,
      maxPerDay: 5,
      minGapMinutes: 15,
      autoTriggerMinToolCalls: 8,
      failureRateThreshold: 0.4,
      minUsesBeforeImprovement: 30,
      ttlDays: 60,
      maxEnabledPerAgent: 15,
      maxGeneratedTotal: 50,
      deprecateAfterNegativeUses: 10,
    };

    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();
    const traceStore = new SkillTraceStore(dataDir);
    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(
      config.agents.defaults.model,
      config.agents.defaults.subagents?.model ?? config.agents.defaults.model,
      credStore,
    );
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget ?? {});
    const rateLimiter = new SkillRateLimiter(dataDir, { maxPerDay: synthConfig.maxPerDay, minGapMinutes: synthConfig.minGapMinutes });

    const improver = new SkillImprover({
      traceStore,
      registry,
      router,
      budget,
      config: synthConfig,
      outputDir: opts.outputDir,
    });

    const candidates = opts.name
      ? (registry.get(opts.name) ? [registry.get(opts.name)!.definition] : [])
      : improver.findCandidates();

    if (candidates.length === 0) {
      console.log('\n✅ No skills qualify for improvement at this time.\n');
      rateLimiter.close();
      traceStore.close();
      return;
    }

    console.log(`\n🔧 Found ${candidates.length} improvement candidate(s):\n`);
    for (const c of candidates) {
      const m = registry.get(c.name)?.state.metrics;
      const rate = m && m.uses > 0 ? ((m.failures / m.uses) * 100).toFixed(1) + '%' : 'n/a';
      console.log(`   ${c.name} — failure rate: ${rate} (${m?.failures ?? 0}/${m?.uses ?? 0} uses)`);
    }

    if (opts.dryRun) {
      console.log('\n   [dry-run] No files written.\n');
      rateLimiter.close();
      traceStore.close();
      return;
    }

    console.log('\n   Improving...\n');
    const results = await improver.improveAll({ agentId: 'cli', dryRun: opts.dryRun });

    for (const r of results) {
      if (r.errors) {
        console.error(`   ❌ ${r.skillName}: ${r.errors.join(', ')}`);
      } else if (r.skipped) {
        console.log(`   ⏭️  ${r.skillName}: skipped — ${r.skipped}`);
      } else if (r.sandboxRejected) {
        console.log(`   🚫 ${r.skillName}: sandbox rejected revision (would increase token usage)`);
      } else if (r.revised) {
        console.log(`   ✅ ${r.skillName} → revision ${r.revised.revision} queued for approval`);
        console.log(`      Run: ai-desk skill approve ${r.skillName}`);
      }
    }
    console.log('');

    rateLimiter.close();
    traceStore.close();
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

skillCmd
  .command('merge <nameA> <nameB>')
  .description('Merge two compatible skills into a single consolidated skill')
  .option('--name <merged-name>', 'Name for the merged skill (default: <nameA>-<nameB>-merged)')
  .option('--dry-run', 'Preview merge result without writing to disk', false)
  .option('--archive-sources', 'Archive both source skills after merge is registered', false)
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (nameA, nameB, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const available = router.status().filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();

    const { SkillMerger } = await import('../skills/skill-merger.js');
    const merger = new SkillMerger({ registry, router, outputDir: generatedDir });

    console.log(`\n🔀 ${opts.dryRun ? '[DRY RUN] ' : ''}Merging "${nameA}" + "${nameB}"...\n`);

    const result = await merger.merge(nameA, nameB, {
      dryRun: opts.dryRun,
      mergedName: opts.name,
      agentId: 'cli',
    });

    if (result.conflict) {
      console.error(`❌ Merge conflict: ${result.conflict}\n`);
      process.exit(1);
    }
    if (result.errors?.length) {
      console.error(`❌ Merge failed:\n${result.errors.join('\n')}\n`);
      process.exit(1);
    }

    const m = result.merged!;
    console.log(`✅ Merged skill: ${m.name} v${m.version}`);
    console.log(`   ${m.description}`);
    if (m.tags?.length) console.log(`   Tags:  ${m.tags.join(', ')}`);
    if (m.toolAllowlist?.length) console.log(`   Tools: ${m.toolAllowlist.join(', ')}`);
    if (m.kind === 'avoid') console.log(`   Kind:  avoid`);
    if (result.filePath) console.log(`   Written to: ${result.filePath}`);

    if (result.dryRun) {
      console.log('\n   [DRY RUN] Skill was NOT written to disk or registered.\n');
    } else {
      if (opts.archiveSources) {
        merger.archiveSources(nameA, nameB, { connectionId: 'cli' });
        console.log(`\n   Source skills archived: ${nameA}, ${nameB}`);
      }
      console.log('\n   Merged skill is pending approval. Run:');
      console.log(`     ai-desk skill approve ${m.name}\n`);
    }
  });

skillCmd
  .command('merge-candidates')
  .description('List pairs of enabled skills that are good candidates for merging')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, __pkgSkills]);
    await registry.init();

    const { SkillMerger } = await import('../skills/skill-merger.js');
    const merger = new SkillMerger({
      registry,
      router: null as any, // only findMergeCandidates is called — no LLM needed
      outputDir: resolve(opts.skillsDir, 'generated'),
    });

    const pairs = merger.findMergeCandidates();
    if (pairs.length === 0) {
      console.log('\n   No merge candidates found.\n');
      return;
    }

    console.log(`\n🔀 Merge candidates (${pairs.length}):\n`);
    for (const [a, b] of pairs) {
      console.log(`   ${a}  +  ${b}`);
      console.log(`     Run: ai-desk skill merge ${a} ${b}`);
    }
    console.log('');
  });

skillCmd
  .command('scope <name>')
  .description('Set the multi-agent scope for a skill')
  .requiredOption('--set <scope>', 'Scope: agent | project | global')
  .option('--allow-agent <id>', 'Agent ID to allow when scope=agent (repeatable)', (v: string, acc: string[]) => [...acc, v], [] as string[])
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const scopeValue = opts.set as 'agent' | 'project' | 'global';
    if (!['agent', 'project', 'global'].includes(scopeValue)) {
      console.error(`\n❌ Invalid scope "${scopeValue}". Must be: agent, project, or global.\n`);
      process.exit(1);
    }

    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();

    const skill = registry.get(name);
    if (!skill) {
      console.error(`\n❌ Skill "${name}" not found.\n`);
      process.exit(1);
    }

    skill.definition.scope = scopeValue;
    if (scopeValue === 'agent' && opts.allowAgent.length > 0) {
      skill.definition.allowedAgents = [
        ...new Set([...(skill.definition.allowedAgents ?? []), ...opts.allowAgent]),
      ];
    } else if (scopeValue !== 'agent') {
      skill.definition.allowedAgents = undefined;
    }

    // Re-register to persist the change
    registry.registerExternal(skill.definition, skill.state.filePath);

    console.log(`\n✅ Skill "${name}" scope set to: ${scopeValue}`);
    if (scopeValue === 'agent' && skill.definition.allowedAgents?.length) {
      console.log(`   Allowed agents: ${skill.definition.allowedAgents.join(', ')}`);
    }
    console.log('');
  });

skillCmd
  .command('eval [skill-name]')
  .description('Run golden task evaluations against one or all enabled skills')
  .option('--all', 'Evaluate all enabled skills', false)
  .option('--tag <tag>', 'Only run evals with this tag (repeatable)', (v: string, acc: string[]) => [...acc, v], [] as string[])
  .option('--evals-dir <path>', 'Directory containing *.eval.json files', 'evals/golden')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .option('-c, --config <path>', 'Config file path', 'ai-desk.json')
  .action(async (skillName: string | undefined, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const available = router.status().filter(p => p.available);
    if (available.length === 0) {
      console.error('\n❌ No model providers available. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.\n');
      process.exit(1);
    }

    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();

    const { SkillEvaluator } = await import('../skills/skill-eval.js');
    const evaluator = new SkillEvaluator({ registry, router, goldenDir: opts.evalsDir });

    const evalOpts = { tags: opts.tag.length ? opts.tag : undefined, goldenDir: opts.evalsDir };

    let reports;
    if (opts.all || !skillName) {
      console.log('\n🧪 Evaluating all enabled skills...\n');
      reports = await evaluator.evalAll(evalOpts);
    } else {
      console.log(`\n🧪 Evaluating skill: ${skillName}\n`);
      reports = [await evaluator.evalSkill(skillName, evalOpts)];
    }

    let anyResults = false;
    for (const report of reports) {
      if (report.totalTasks === 0) continue;
      anyResults = true;
      const pct = (report.score * 100).toFixed(0);
      const icon = report.score >= 0.8 ? '✅' : report.score >= 0.5 ? '⚠️ ' : '❌';
      console.log(`${icon} ${report.skillName}: ${report.passed}/${report.totalTasks} passed (${pct}%)`);
      for (const r of report.results) {
        const rIcon = r.passed ? '  ✓' : '  ✗';
        console.log(`${rIcon} [${r.taskId}] ${r.reasoning}`);
      }
      console.log('');
    }

    if (!anyResults) {
      console.log('   No eval tasks found. Add *.eval.json files to evals/golden/\n');
    }
  });

skillCmd
  .command('export <name>')
  .description('Export a skill as a portable bundle JSON file')
  .option('--out <path>', 'Output file path (default: <name>.skill-bundle.json)')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .action(async (name, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();

    const { exportSkill } = await import('../skills/skill-export.js');
    const outPath = opts.out ?? `${name}.skill-bundle.json`;

    try {
      const result = exportSkill(registry, name, outPath);
      console.log(`\n✅ Exported: ${result.filePath}`);
      console.log(`   Skill: ${result.bundle.skill.name} v${result.bundle.skill.version}`);
      console.log(`   Checksum: ${result.bundle.exportMeta.checksum.slice(0, 16)}...\n`);
    } catch (err) {
      console.error(`\n❌ Export failed: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

skillCmd
  .command('import <bundle-path>')
  .description('Import a skill bundle and register it for approval')
  .option('--skills-dir <path>', 'Skills directory', 'skills')
  .option('--skip-conflict-check', 'Skip conflict detection (not recommended)', false)
  .action(async (bundlePath, opts) => {
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const generatedDir = resolve(opts.skillsDir, 'generated');
    const registry = new SkillRegistry(dataDir, [opts.skillsDir, generatedDir, __pkgSkills]);
    await registry.init();

    const { importSkill } = await import('../skills/skill-import.js');

    console.log(`\n📦 Importing skill bundle: ${bundlePath}\n`);

    const result = importSkill(registry, {
      bundlePath: resolve(bundlePath),
      outputDir: generatedDir,
      actor: { connectionId: 'cli' },
      skipConflictCheck: opts.skipConflictCheck,
    });

    if (result.errors?.length) {
      console.error(`❌ Import failed:\n${result.errors.join('\n')}\n`);
      process.exit(1);
    }

    if (result.conflicts?.length) {
      console.log(`⚠️  Conflict warnings:`);
      for (const c of result.conflicts) console.log(`   - ${c}`);
    }

    console.log(`✅ Imported: ${result.skillName}`);
    if (result.filePath) console.log(`   Written to: ${result.filePath}`);
    console.log('\n   Skill is pending approval. Run:');
    console.log(`     ai-desk skill approve ${result.skillName}\n`);
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
    const memoryCfg2 = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore2 = memoryCfg2.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg2, memoryStore2);
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
      memoryStore: memoryStore2,
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
    const memoryCfg3 = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore3 = memoryCfg3.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg3, memoryStore3);
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
      memoryStore: memoryStore3,
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
    const memoryCfg4 = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore4 = memoryCfg4.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg4, memoryStore4);
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
      memoryStore: memoryStore4,
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
    const memoryCfg5 = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore5 = memoryCfg5.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg5, memoryStore5);
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
      memoryStore: memoryStore5,
    });

    const { TeamCoordinator } = await import('../roles/team-coordinator.js');
    const { ProjectStore } = await import('../projects/project-store.js');
    const { IssueStore } = await import('../projects/issue-store.js');
    const dataDir2 = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const coordinator = new TeamCoordinator({
      runtime,
      roles: config.teams.roles,
      teams: config.teams.teams,
      projectStore: new ProjectStore(dataDir2),
      issueStore: new IssueStore(dataDir2),
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

// ─── Projects ─────────────────────────────────────────────

const projectCmd = program
  .command('projects')
  .description('Team project management (persistent workspaces)');

projectCmd
  .command('list')
  .description('List all projects')
  .option('--team <teamId>', 'Filter by team ID')
  .action(async (opts) => {
    const { ProjectStore } = await import('../projects/project-store.js');
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const store = new ProjectStore(dataDir);

    const projects = opts.team
      ? store.listByTeam(opts.team)
      : store.listAll();

    if (!projects || projects.length === 0) {
      console.log('\n  No projects found.\n');
      store.close();
      return;
    }

    console.log('\n📁 Projects:\n');
    for (const p of projects) {
      const status = p.status === 'archived' ? ' [archived]' : '';
      console.log(`  ${p.id}${status}`);
      console.log(`    Name:      ${p.name}`);
      console.log(`    Workspace: ${p.workspacePath}`);
      console.log(`    Updated:   ${new Date(p.updatedAt).toLocaleString()}`);
      if (p.lastRunId) console.log(`    Last run:  ${p.lastRunId}`);
      console.log('');
    }
    store.close();
  });

projectCmd
  .command('show <projectId>')
  .description('Show project details including artifacts and recent runs')
  .action(async (projectId) => {
    const { ProjectStore } = await import('../projects/project-store.js');
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const store = new ProjectStore(dataDir);

    const project = store.getProject(projectId);
    if (!project) {
      console.error(`\n❌ Project "${projectId}" not found\n`);
      store.close();
      process.exit(1);
    }

    console.log(`\n📁 Project: ${project.name}`);
    console.log(`   ID:        ${project.id}`);
    console.log(`   Team:      ${project.teamId}`);
    console.log(`   Workspace: ${project.workspacePath}`);
    console.log(`   Status:    ${project.status}`);
    console.log(`   Created:   ${new Date(project.createdAt).toLocaleString()}`);

    if (project.brief) {
      console.log('\n   Brief:');
      for (const line of project.brief.split('\n')) {
        console.log(`     ${line}`);
      }
    }

    const artifacts = store.listArtifacts(projectId);
    if (artifacts.length > 0) {
      console.log(`\n   Artifacts (${artifacts.length}):`);
      for (const a of artifacts) {
        console.log(`     ${a.path} — ${a.summary || '(no summary)'}`);
      }
    }

    const runs = store.listRunsByProject(projectId, 10);
    if (runs.length > 0) {
      console.log('\n   Recent runs:');
      for (const r of runs) {
        const icon = r.status === 'done' ? '✅' : r.status === 'failed' ? '❌' : '⏳';
        console.log(`     ${icon} ${r.id} [${r.kind}] ${new Date(r.startedAt).toLocaleString()}`);
        console.log(`        ${r.goal.slice(0, 80)}${r.goal.length > 80 ? '…' : ''}`);
      }
    }

    console.log('');
    store.close();
  });

projectCmd
  .command('archive <projectId>')
  .description('Archive a project (keeps data, stops auto-bind)')
  .action(async (projectId) => {
    const { ProjectStore } = await import('../projects/project-store.js');
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const store = new ProjectStore(dataDir);

    const project = store.getProject(projectId);
    if (!project) {
      console.error(`\n❌ Project "${projectId}" not found\n`);
      store.close();
      process.exit(1);
    }

    store.archive(projectId);
    console.log(`\n✅ Project "${project.name}" (${projectId}) archived.\n`);
    store.close();
  });

// ─── Runs ─────────────────────────────────────────────────

const runsCmd = program
  .command('runs')
  .description('Team run history and resume');

runsCmd
  .command('list')
  .description('List runs for a project')
  .requiredOption('--project <projectId>', 'Project ID')
  .option('--limit <n>', 'Max results', '20')
  .action(async (opts) => {
    const { ProjectStore } = await import('../projects/project-store.js');
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const store = new ProjectStore(dataDir);

    const runs = store.listRunsByProject(opts.project, Number(opts.limit));
    if (runs.length === 0) {
      console.log('\n  No runs found for this project.\n');
      store.close();
      return;
    }

    console.log(`\n🏃 Runs for project ${opts.project}:\n`);
    for (const r of runs) {
      const icon = r.status === 'done' ? '✅' : r.status === 'failed' ? '❌' : '⏳';
      console.log(`  ${icon} ${r.id} [${r.kind}] ${r.status}`);
      console.log(`     Goal:    ${r.goal.slice(0, 80)}${r.goal.length > 80 ? '…' : ''}`);
      console.log(`     Started: ${new Date(r.startedAt).toLocaleString()}`);
      const tasks = store.listTasksByRun(r.id);
      if (tasks.length > 0) {
        const done = tasks.filter(t => t.status === 'done').length;
        const failed = tasks.filter(t => t.status === 'failed').length;
        console.log(`     Tasks:   ${done}/${tasks.length} done${failed > 0 ? `, ${failed} failed` : ''}`);
      }
      console.log('');
    }
    store.close();
  });

runsCmd
  .command('resume <runId>')
  .description('Resume a failed or paused team run')
  .option('-c, --config <path>', 'Config path', 'ai-desk.json')
  .action(async (runId, opts) => {
    const masterKey = requireMasterKey();
    const dataDir = process.env.AI_DESK_DATA_DIR ?? './.ai-desk-data';
    const { config } = loadConfig(opts.config);

    if (!config.teams || config.teams.teams.length === 0) {
      console.error('\n❌ No teams configured in ai-desk.json\n');
      process.exit(1);
    }

    const { ProjectStore } = await import('../projects/project-store.js');
    const store = new ProjectStore(dataDir);
    const run = store.getRun(runId);
    if (!run) {
      console.error(`\n❌ Run "${runId}" not found\n`);
      store.close();
      process.exit(1);
    }

    if (run.status === 'done') {
      console.log(`\n✅ Run "${runId}" already completed.\n`);
      store.close();
      return;
    }

    const credStore = new CredentialStore(dataDir, masterKey);
    const router = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model, credStore);
    const sessions = new SessionStore(dataDir, masterKey);
    const policy = new PolicyEngine(config.agents.defaults.tools);
    const sandbox = new SandboxManager(config.agents.defaults.sandbox);
    const threat = new ThreatDetector();
    const budget = new BudgetTracker(dataDir, config.agents.defaults.budget);
    const cache = new ResponseCache(dataDir, masterKey,
      config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
    const memoryCfg6 = config.memory ?? { backend: 'none', compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' } };
    const memoryStore6 = memoryCfg6.backend === 'sqlite-vec' ? new MemoryStore(dataDir) : undefined;
    const compactor = new ContextCompactor(router, memoryCfg6, memoryStore6);
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
      memoryStore: memoryStore6,
    });

    const { TeamCoordinator } = await import('../roles/team-coordinator.js');
    const { IssueStore: IssueStore2 } = await import('../projects/issue-store.js');
    const coordinator = new TeamCoordinator({
      runtime,
      roles: config.teams.roles,
      teams: config.teams.teams,
      projectStore: store,
      issueStore: new IssueStore2(dataDir),
    });

    const tasks = store.listTasksByRun(runId);
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'failed').length;
    console.log(`\n🔄 Resuming run "${runId}" (${pending} tasks remaining)...\n`);

    const result = await coordinator.resume(runId);

    console.log('\n─── Resume Result ──────────────────────────');
    console.log(result.synthesis);
    console.log('─────────────────────────────────────────────');
    const icon = result.success ? '✅' : '⚠️ ';
    console.log(`${icon} Done: ${result.doneCount}/${result.taskCount} | Failed: ${result.failedCount}\n`);

    sessions.close_db();
    budget.close();
    cache.close();
    store.close();
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
