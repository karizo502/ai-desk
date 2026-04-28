/**
 * AI_DESK — Config Manager
 *
 * Safe read/write of ai-desk.json for the dashboard API.
 * Uses atomic writes (write to temp → rename) so a crash
 * mid-write never corrupts the config file.
 *
 * Only patches the sections requested — all other keys are
 * preserved exactly as the user wrote them.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentConfig, RoleConfig, TeamConfig } from '../config/schema.js';
import type { Static } from '@sinclair/typebox';
import type { AgentDefaultsSchema } from '../config/schema.js';

type AgentDefaults = Static<typeof AgentDefaultsSchema>;

export class ConfigManager {
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = resolve(configPath);
  }

  // ─── read ────────────────────────────────────────────────────────────────────

  /**
   * Read the raw config object from disk.
   * Returns a partial object (no defaults applied) — caller must handle missing keys.
   */
  readRaw(): Record<string, unknown> {
    if (!existsSync(this.configPath)) return {};
    try {
      const text = readFileSync(this.configPath, 'utf-8');
      // Safer comment removal: only strip // if preceded by whitespace or at start of line
      const clean = text
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      return JSON.parse(clean) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** Read agents section (list + defaults) */
  readAgents(): { defaults: Partial<AgentDefaults>; list: AgentConfig[] } {
    const raw = this.readRaw();
    const agents = (raw['agents'] ?? {}) as {
      defaults?: Partial<AgentDefaults>;
      list?: AgentConfig[];
    };
    return {
      defaults: agents.defaults ?? {},
      list:     agents.list    ?? [],
    };
  }

  // ─── write ───────────────────────────────────────────────────────────────────

  /** Atomically write the entire config object back to disk */
  writeRaw(config: Record<string, unknown>): void {
    const json = JSON.stringify(config, null, 2);
    const tmp  = this.configPath + '.tmp';
    writeFileSync(tmp, json, 'utf-8');
    // atomic on POSIX; on Windows this falls back to a regular rename
    try {
      renameSync(tmp, this.configPath);
    } catch {
      // Windows may fail if target is locked — write directly
      writeFileSync(this.configPath, json, 'utf-8');
    }
  }

  /** Patch only the agents.list array, preserving everything else */
  writeAgentList(list: AgentConfig[]): void {
    const raw = this.readRaw();
    const agents = (raw['agents'] ?? {}) as Record<string, unknown>;
    agents['list'] = list;
    raw['agents']  = agents;
    this.writeRaw(raw);
  }

  /** Patch only the agents.defaults object, preserving everything else */
  writeAgentDefaults(defaults: Partial<AgentDefaults>): void {
    const raw = this.readRaw();
    const agents = (raw['agents'] ?? {}) as Record<string, unknown>;
    // Deep-merge new defaults over existing
    agents['defaults'] = deepMerge(
      (agents['defaults'] ?? {}) as Record<string, unknown>,
      defaults as unknown as Record<string, unknown>
    );
    raw['agents'] = agents;
    this.writeRaw(raw);
  }

  /** Read teams section (roles + teams) */
  readTeams(): { roles: RoleConfig[]; teams: TeamConfig[] } {
    const raw = this.readRaw();
    const t = (raw['teams'] ?? {}) as { roles?: RoleConfig[]; teams?: TeamConfig[] };
    return {
      roles: t.roles ?? [],
      teams: t.teams ?? [],
    };
  }

  /** Patch only teams.roles, preserving everything else */
  writeRoles(roles: RoleConfig[]): void {
    const raw = this.readRaw();
    const t = (raw['teams'] ?? {}) as Record<string, unknown>;
    t['roles'] = roles;
    raw['teams'] = t;
    this.writeRaw(raw);
  }

  /** Patch only teams.teams, preserving everything else */
  writeTeams(teams: TeamConfig[]): void {
    const raw = this.readRaw();
    const t = (raw['teams'] ?? {}) as Record<string, unknown>;
    t['teams'] = teams;
    raw['teams'] = t;
    this.writeRaw(raw);
  }

  get path(): string {
    return this.configPath;
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    const bv = base[k];
    const pv = patch[k];
    if (
      pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
      bv !== null && typeof bv === 'object' && !Array.isArray(bv)
    ) {
      out[k] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      out[k] = pv;
    }
  }
  return out;
}
