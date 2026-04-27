/**
 * AI_DESK — Config Loader
 *
 * Loads config from ai-desk.json with env var overrides.
 * Applies security defaults for any missing values.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { AiDeskConfigSchema, type AiDeskConfig } from './schema.js';

/** Security-first default config — every value is the safest option */
const SECURE_DEFAULTS: AiDeskConfig = {
  gateway: {
    bind: '127.0.0.1',
    port: 18789,
    auth: {
      mode: 'token',
      maxFailedAttempts: 5,
      lockoutDurationMs: 300_000,
      tokenExpiryMs: 86_400_000,
    },
    rateLimit: {
      maxPerSecond: 10,
      maxConnections: 50,
    },
    maxFrameSize: 1_048_576,
    heartbeatIntervalMs: 30_000,
  },
  agents: {
    defaults: {
      model: {
        primary: 'anthropic/claude-sonnet-4-6',
        failover: ['google/gemini-2.5-flash', 'anthropic/claude-opus-4-6'],
        compaction: 'anthropic/claude-haiku-3.5',
        embedding: 'google/text-embedding-004',
      },
      timeoutSeconds: 172_800,
      sandbox: {
        mode: 'all',
        timeoutMs: 30_000,
        maxMemoryMb: 512,
        networkAccess: false,
      },
      tools: {
        profile: 'deny-all',
      },
      budget: {
        daily: { tokens: 500_000, cost: 5.0 },
        monthly: { tokens: 10_000_000, cost: 100.0 },
        perRun: { maxTokens: 50_000 },
        warningThreshold: 0.8,
        action: 'pause',
      },
      subagents: {
        model: 'google/gemini-2.5-flash',
        maxDepth: 3,
        maxConcurrent: 5,
        sandbox: 'require',
        runTimeoutSeconds: 300,
        budget: 'inherit',
      },
    },
    list: [
      {
        id: 'main',
        default: true,
        workspace: '~/.ai-desk/workspace',
      },
    ],
  },
  cache: {
    enabled: true,
    backend: 'sqlite',
    ttlSeconds: 3600,
  },
  memory: {
    backend: 'none',
    compaction: {
      threshold: 0.6,
      model: 'anthropic/claude-haiku-3.5',
    },
  },
};

/** Environment variable overrides (security-relevant only) */
function applyEnvOverrides(config: AiDeskConfig): AiDeskConfig {
  const env = process.env;

  if (env.AI_DESK_BIND) {
    config.gateway.bind = env.AI_DESK_BIND;
  }
  if (env.AI_DESK_PORT) {
    const port = parseInt(env.AI_DESK_PORT, 10);
    if (port >= 1024 && port <= 65535) {
      config.gateway.port = port;
    }
  }
  // NOTE: AI_DESK_AUTH_TOKEN is NOT stored in config — handled by auth-manager

  return config;
}

/** Security validation: catch config drift toward insecure settings */
function validateSecurityInvariants(config: AiDeskConfig): string[] {
  const warnings: string[] = [];

  // Gateway must not bind to 0.0.0.0 without explicit override
  if (config.gateway.bind === '0.0.0.0') {
    warnings.push(
      'SECURITY: Gateway is bound to 0.0.0.0 (all interfaces). ' +
      'This exposes the gateway to the network. Use 127.0.0.1 for local-only access.'
    );
  }

  // Tool profile must not be 'full' as default
  if (config.agents.defaults.tools.profile === 'full') {
    warnings.push(
      'SECURITY: Default tool profile is "full" (all tools allowed). ' +
      'Recommend using "deny-all" or "readonly" for security.'
    );
  }

  // Sub-agent sandbox must be 'require'
  if (config.agents.defaults.subagents.sandbox !== 'require') {
    warnings.push(
      'SECURITY: Sub-agent sandbox is not set to "require". ' +
      'Sub-agents should always run in a sandbox.'
    );
  }

  // Sub-agent depth must be reasonable
  if (config.agents.defaults.subagents.maxDepth > 5) {
    warnings.push(
      `SECURITY: Sub-agent max depth is ${config.agents.defaults.subagents.maxDepth}. ` +
      'High depth can cause exponential token costs. Recommended: 3.'
    );
  }

  return warnings;
}

/**
 * Load AI_DESK configuration.
 * Priority: env vars > ai-desk.json > secure defaults
 */
export function loadConfig(configPath?: string): {
  config: AiDeskConfig;
  warnings: string[];
  source: string;
} {
  const resolvedPath = configPath ?? resolve(process.cwd(), 'ai-desk.json');
  let userConfig: Partial<AiDeskConfig> = {};
  let source = 'defaults';

  if (existsSync(resolvedPath)) {
    try {
      const raw = readFileSync(resolvedPath, 'utf-8');
      // Strip JSON5 comments (simple line comment removal)
      const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      userConfig = JSON.parse(cleaned);
      source = resolvedPath;
    } catch (err) {
      throw new Error(
        `Failed to parse config file: ${resolvedPath}\n${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Deep merge: user config over secure defaults
  const merged = deepMerge(SECURE_DEFAULTS, userConfig) as AiDeskConfig;

  // Apply env overrides
  const config = applyEnvOverrides(merged);

  // Validate against TypeBox schema
  if (!Value.Check(AiDeskConfigSchema, config)) {
    const errors = [...Value.Errors(AiDeskConfigSchema, config)];
    const messages = errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Config validation failed:\n${messages}`);
  }

  // Security invariant checks
  const warnings = validateSecurityInvariants(config);

  return { config, warnings, source };
}

/** Deep merge utility (target values win over source) */
function deepMerge(source: unknown, target: unknown): unknown {
  if (target === undefined || target === null) return source;
  if (source === undefined || source === null) return target;

  if (
    typeof source === 'object' && !Array.isArray(source) &&
    typeof target === 'object' && !Array.isArray(target)
  ) {
    const result: Record<string, unknown> = { ...(source as Record<string, unknown>) };
    for (const key of Object.keys(target as Record<string, unknown>)) {
      result[key] = deepMerge(
        (source as Record<string, unknown>)[key],
        (target as Record<string, unknown>)[key]
      );
    }
    return result;
  }

  return target;
}

export { SECURE_DEFAULTS };
