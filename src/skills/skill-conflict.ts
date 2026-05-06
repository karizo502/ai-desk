/**
 * AI_DESK — Skill Conflict Detector
 *
 * Detects conflicts between a candidate skill's systemPromptAddition and
 * the systemPromptAdditions of already-enabled skills.
 *
 * Two checks:
 *   1. Topic overlap — Jaccard similarity on word sets (threshold 0.35 = warn, 0.6 = block)
 *   2. Contradicting imperatives — "always X" vs "never X" for the same verb/object pair
 */

import type { SkillDefinition } from './skill.js';

export type ConflictSeverity = 'none' | 'warn' | 'block';

export interface ConflictReport {
  severity: ConflictSeverity;
  /** Name of the existing skill that conflicts */
  conflictingSkill?: string;
  explanation?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'be', 'been', 'was', 'were',
  'it', 'its', 'this', 'that', 'as', 'if', 'not', 'no', 'do', 'does',
  'will', 'when', 'all', 'any', 'each', 'use', 'make', 'should', 'must',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Extracts (verb|adjective, object) pairs following "always" or "never" */
function extractImperatives(text: string): Map<string, 'always' | 'never'> {
  const result = new Map<string, 'always' | 'never'>();
  const re = /\b(always|never)\s+([\w\s]{3,40}?)(?:[.,;!?\n]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const polarity = m[1].toLowerCase() as 'always' | 'never';
    const phrase = m[2].trim().toLowerCase().replace(/\s+/g, ' ');
    if (phrase.length >= 3) result.set(phrase, polarity);
  }
  return result;
}

function checkImperativeConflict(
  candidateText: string,
  existingText: string,
): string | null {
  const candidateImp = extractImperatives(candidateText);
  const existingImp = extractImperatives(existingText);

  for (const [phrase, polarity] of candidateImp) {
    const existingPolarity = existingImp.get(phrase);
    if (existingPolarity && existingPolarity !== polarity) {
      return `"${polarity} ${phrase}" contradicts "${existingPolarity} ${phrase}"`;
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

const OVERLAP_WARN = 0.35;
const OVERLAP_BLOCK = 0.60;

/**
 * Check a candidate skill against a list of already-enabled skills.
 * Returns the worst conflict found (block > warn > none).
 */
export function detectConflicts(
  candidate: Pick<SkillDefinition, 'name' | 'systemPromptAddition' | 'tags'>,
  enabledSkills: Pick<SkillDefinition, 'name' | 'systemPromptAddition' | 'tags'>[],
): ConflictReport {
  const candidateText = candidate.systemPromptAddition ?? '';
  const candidateWords = tokenize(candidateText);

  let worst: ConflictReport = { severity: 'none' };

  for (const skill of enabledSkills) {
    if (skill.name === candidate.name) continue;
    const existingText = skill.systemPromptAddition ?? '';
    const existingWords = tokenize(existingText);

    // Check contradicting imperatives first (always block-level)
    const imperative = checkImperativeConflict(candidateText, existingText);
    if (imperative) {
      return {
        severity: 'block',
        conflictingSkill: skill.name,
        explanation: `Contradicting instructions with "${skill.name}": ${imperative}`,
      };
    }

    // Topic overlap
    const sim = jaccard(candidateWords, existingWords);
    if (sim >= OVERLAP_BLOCK) {
      return {
        severity: 'block',
        conflictingSkill: skill.name,
        explanation: `High topic overlap (${(sim * 100).toFixed(0)}%) with "${skill.name}" — skill may duplicate or conflict`,
      };
    }
    if (sim >= OVERLAP_WARN && worst.severity !== 'block') {
      worst = {
        severity: 'warn',
        conflictingSkill: skill.name,
        explanation: `Moderate topic overlap (${(sim * 100).toFixed(0)}%) with "${skill.name}" — review before approving`,
      };
    }
  }

  return worst;
}

/**
 * Summarise conflicts across all pending skills vs enabled ones.
 * Returns one ConflictReport per pending skill (severity 'none' entries included).
 */
export function auditPendingConflicts(
  pendingSkills: Pick<SkillDefinition, 'name' | 'systemPromptAddition' | 'tags'>[],
  enabledSkills: Pick<SkillDefinition, 'name' | 'systemPromptAddition' | 'tags'>[],
): Array<{ skillName: string } & ConflictReport> {
  return pendingSkills.map(skill => ({
    skillName: skill.name,
    ...detectConflicts(skill, enabledSkills),
  }));
}
