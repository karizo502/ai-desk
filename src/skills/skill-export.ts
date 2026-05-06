/**
 * AI_DESK — Skill Export
 *
 * Bundles a skill definition into a portable JSON file.
 * PII is scrubbed before export; the bundle includes a checksum for integrity.
 *
 * Bundle format:
 * {
 *   version: '1',
 *   skill: SkillDefinition,
 *   exportMeta: { exportedAt, exportedBy, checksum, aiDeskVersion }
 * }
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillDefinition } from './skill.js';

export interface SkillBundle {
  version: '1';
  skill: SkillDefinition;
  exportMeta: {
    exportedAt: number;
    exportedBy?: string;
    checksum: string;
    aiDeskVersion?: string;
  };
}

export interface ExportResult {
  bundle: SkillBundle;
  /** Path written (if outPath was provided) */
  filePath?: string;
}

export function exportSkill(
  registry: SkillRegistry,
  skillName: string,
  outPath?: string,
  exportedBy?: string,
): ExportResult {
  const loaded = registry.get(skillName);
  if (!loaded) {
    throw new Error(`Skill "${skillName}" not found`);
  }

  const scrubbed = scrubSkillForExport(loaded.definition);
  const checksum = sha256(JSON.stringify(scrubbed));

  const bundle: SkillBundle = {
    version: '1',
    skill: scrubbed,
    exportMeta: {
      exportedAt: Date.now(),
      exportedBy,
      checksum,
    },
  };

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { bundle, filePath: outPath };
  }

  return { bundle };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Scrub fields that might carry PII or environment-specific data before export.
 * - sourceSessionId → redacted
 * - traceHash → kept (it's a hash, not PII)
 * - env values in mcpServer → redacted
 * - allowedAgents → cleared (agent IDs are environment-specific)
 */
function scrubSkillForExport(def: SkillDefinition): SkillDefinition {
  const copy: SkillDefinition = { ...def };

  copy.sourceSessionId = copy.sourceSessionId ? '[redacted]' : undefined;
  copy.allowedAgents = undefined; // env-specific

  if (copy.mcpServer?.env) {
    copy.mcpServer = {
      ...copy.mcpServer,
      env: Object.fromEntries(
        Object.keys(copy.mcpServer.env).map(k => [k, '[redacted]']),
      ),
    };
  }

  return copy;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
