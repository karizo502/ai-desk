/**
 * AI_DESK — Skill Import
 *
 * Validates and imports a skill bundle produced by skill-export.
 * Pipeline:
 *   1. Parse and validate bundle format
 *   2. Verify checksum integrity
 *   3. Validate skill definition (security guards — no mcpServer for generated)
 *   4. Conflict check against existing enabled skills
 *   5. Register as pending approval (never auto-enable)
 *
 * Importing does NOT automatically enable the skill.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { SkillRegistry } from './skill-registry.js';
import { detectConflicts } from './skill-conflict.js';
import { checkGeneratedSkillDefinition } from './skill.schema.js';
import type { SkillBundle } from './skill-export.js';

export interface ImportOptions {
  /** Path to the bundle JSON file */
  bundlePath: string;
  /** Destination directory for the imported skill file */
  outputDir: string;
  /** Actor for audit trail */
  actor?: { connectionId?: string; remoteAddress?: string };
  /** Skip conflict check (not recommended) */
  skipConflictCheck?: boolean;
}

export interface ImportResult {
  skillName?: string;
  filePath?: string;
  /** Conflict warnings or blocking errors */
  conflicts?: string[];
  errors?: string[];
}

export function importSkill(
  registry: SkillRegistry,
  opts: ImportOptions,
): ImportResult {
  // 1. Parse bundle
  let bundle: SkillBundle;
  try {
    const raw = readFileSync(opts.bundlePath, 'utf-8');
    bundle = JSON.parse(raw) as SkillBundle;
  } catch (err) {
    return { errors: [`Failed to read bundle: ${(err as Error).message}`] };
  }

  if (bundle.version !== '1' || !bundle.skill || !bundle.exportMeta) {
    return { errors: ['Invalid bundle format: missing version, skill, or exportMeta'] };
  }

  // 2. Verify checksum
  const expected = bundle.exportMeta.checksum;
  const actual = sha256(JSON.stringify(bundle.skill));
  if (expected !== actual) {
    return { errors: [`Checksum mismatch — bundle may be corrupted or tampered with (expected: ${expected}, got: ${actual})`] };
  }

  const def = bundle.skill;

  // 3. Validate schema (enforces no mcpServer for provenance=generated)
  if (def.provenance === 'generated') {
    const errors = checkGeneratedSkillDefinition(def);
    if (errors) {
      return { errors: [`Skill validation failed:\n${errors.join('\n')}`] };
    }
  }

  // 4. Conflict check
  if (!opts.skipConflictCheck) {
    const enabledSkills = registry.list()
      .filter(s => s.state.enabled)
      .map(s => s.definition);

    const conflictReport = detectConflicts(def, enabledSkills);
    const conflictMsg = conflictReport.severity !== 'none'
      ? conflictReport.explanation ?? `Conflict with ${conflictReport.conflictingSkill ?? 'unknown skill'}`
      : null;

    if (conflictReport.severity === 'block' && conflictMsg) {
      return {
        skillName: def.name,
        conflicts: [conflictMsg],
        errors: [conflictMsg],
      };
    }

    if (conflictReport.severity === 'warn' && conflictMsg) {
      // Non-blocking — proceed but report
      const filePath = writeBundle(def, opts.outputDir);
      registry.registerGenerated(def, filePath, opts.actor);
      return { skillName: def.name, filePath, conflicts: [conflictMsg] };
    }
  }

  // 5. Register as pending approval
  const filePath = writeBundle(def, opts.outputDir);
  registry.registerGenerated(def, filePath, opts.actor);

  return { skillName: def.name, filePath };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function writeBundle(def: import('./skill.js').SkillDefinition, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, `${def.name}.skill.json`);
  writeFileSync(filePath, JSON.stringify(def, null, 2), 'utf-8');
  return filePath;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
