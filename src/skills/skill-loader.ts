/**
 * AI_DESK — Skill Loader
 *
 * Discovers *.skill.json files from the `skills/` directory (relative to cwd),
 * parses them, and performs env-var interpolation on string values.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { SkillDefinition } from './skill.js';

const SKILL_SUFFIX = '.skill.json';
const DEFAULT_SKILLS_DIR = 'skills';

export class SkillLoader {
  private skillsDirs: string[];

  constructor(dirs?: string | string[]) {
    const input = Array.isArray(dirs) ? dirs : [dirs ?? DEFAULT_SKILLS_DIR];
    this.skillsDirs = input.map(d => resolve(d));
  }

  /** Discover and parse all *.skill.json files from all configured directories */
  async loadAll(): Promise<{ definition: SkillDefinition; filePath: string }[]> {
    const results: { definition: SkillDefinition; filePath: string }[] = [];
    const seen = new Set<string>();

    for (const dir of this.skillsDirs) {
      if (!existsSync(dir)) continue;

      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(SKILL_SUFFIX)) continue;
        
        // If multiple directories have the same skill file name, the first one wins
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);

        const filePath = join(dir, entry.name);
        try {
          const raw = await readFile(filePath, 'utf-8');
          const json = JSON.parse(raw) as SkillDefinition;
          const interpolated = interpolateEnv(json) as SkillDefinition;
          this.validate(interpolated, filePath);
          results.push({ definition: interpolated, filePath });
        } catch (err) {
          console.warn(`⚠️  Skill load error (${entry.name}): ${(err as Error).message}`);
        }
      }
    }

    return results;
  }

  /** Load a single skill file by path */
  async loadOne(filePath: string): Promise<SkillDefinition> {
    const raw = await readFile(resolve(filePath), 'utf-8');
    const json = JSON.parse(raw) as SkillDefinition;
    const interpolated = interpolateEnv(json) as SkillDefinition;
    this.validate(interpolated, filePath);
    return interpolated;
  }

  private validate(def: SkillDefinition, filePath: string): void {
    if (!def.name) throw new Error(`Missing "name" in ${filePath}`);
    if (!def.version) throw new Error(`Missing "version" in ${filePath}`);
    if (!def.description) throw new Error(`Missing "description" in ${filePath}`);
    if (!/^[a-z0-9-]+$/.test(def.name)) {
      throw new Error(`Skill name "${def.name}" must be kebab-case (a-z, 0-9, hyphen)`);
    }
  }
}

/** Recursively replace ${VAR} tokens in all string values */
function interpolateEnv(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      return process.env[varName] ?? '';
    });
  }
  if (Array.isArray(value)) return value.map(interpolateEnv);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateEnv(v);
    }
    return result;
  }
  return value;
}
