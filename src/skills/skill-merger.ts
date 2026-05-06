/**
 * AI_DESK — Skill Merger
 *
 * Merges two compatible skills into a single consolidated skill.
 * The merged skill contains the union of capabilities from both parents.
 *
 * Merge rules:
 *   - systemPromptAddition: concatenated with a separator
 *   - toolAllowlist: union (deduplicated)
 *   - tags: union (deduplicated)
 *   - mcpServer: only ONE parent may have mcpServer (conflict → error)
 *   - description: LLM-synthesized from both descriptions
 *   - name: caller-supplied or auto-derived from parent names
 *   - kind: 'avoid' wins if either parent is 'avoid'
 *   - scope: narrowest wins (agent < project < global)
 *   - allowedAgents: union if both are scope='agent'
 *   - revision: 1 (fresh merged skill)
 *   - provenance: 'generated'
 *
 * After approval the two source skills are archived.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelRouter } from '../models/model-router.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillDefinition } from './skill.js';
import { checkGeneratedSkillDefinition } from './skill.schema.js';
import { eventBus } from '../shared/events.js';

export interface MergeOptions {
  dryRun?: boolean;
  /** Override the merged skill name (defaults to <nameA>-<nameB>-merged) */
  mergedName?: string;
  agentId?: string;
}

export interface MergeResult {
  merged?: SkillDefinition;
  filePath?: string;
  dryRun: boolean;
  /** True when the two skills have irreconcilable conflicts */
  conflict?: string;
  errors?: string[];
}

export class SkillMerger {
  private registry: SkillRegistry;
  private router: ModelRouter;
  private outputDir: string;

  constructor(deps: {
    registry: SkillRegistry;
    router: ModelRouter;
    outputDir: string;
  }) {
    this.registry = deps.registry;
    this.router = deps.router;
    this.outputDir = deps.outputDir;
  }

  /**
   * Find pairs of skills that are good merge candidates.
   * Criteria: same kind, overlapping tags (Jaccard ≥ 0.3), both enabled.
   */
  findMergeCandidates(): Array<[string, string]> {
    const enabled = this.registry.list().filter(s => s.state.enabled);
    const pairs: Array<[string, string]> = [];

    for (let i = 0; i < enabled.length; i++) {
      for (let j = i + 1; j < enabled.length; j++) {
        const a = enabled[i].definition;
        const b = enabled[j].definition;
        if (a.kind !== b.kind) continue;
        const tagSim = jaccard(
          new Set((a.tags ?? []).map(t => t.toLowerCase())),
          new Set((b.tags ?? []).map(t => t.toLowerCase())),
        );
        if (tagSim >= 0.3) {
          pairs.push([a.name, b.name]);
        }
      }
    }

    return pairs;
  }

  async merge(nameA: string, nameB: string, opts: MergeOptions = {}): Promise<MergeResult> {
    const skillA = this.registry.get(nameA);
    const skillB = this.registry.get(nameB);

    if (!skillA) return { dryRun: opts.dryRun ?? false, errors: [`Skill "${nameA}" not found`] };
    if (!skillB) return { dryRun: opts.dryRun ?? false, errors: [`Skill "${nameB}" not found`] };

    const a = skillA.definition;
    const b = skillB.definition;

    // Block merge if both have mcpServer (can't run two at once under the same name)
    if (a.mcpServer && b.mcpServer) {
      return {
        dryRun: opts.dryRun ?? false,
        conflict: `Both "${nameA}" and "${nameB}" declare mcpServer — cannot merge`,
      };
    }

    // kind resolution: 'avoid' wins
    const mergedKind: SkillDefinition['kind'] =
      a.kind === 'avoid' || b.kind === 'avoid' ? 'avoid' : 'positive';

    // scope resolution: narrowest wins
    const mergedScope = narrowestScope(a.scope, b.scope);
    const mergedAllowedAgents = mergedScope === 'agent'
      ? [...new Set([...(a.allowedAgents ?? []), ...(b.allowedAgents ?? [])])]
      : undefined;

    // systemPromptAddition merge
    const mergedPromptAddition = mergePromptAdditions(a.systemPromptAddition, b.systemPromptAddition);

    // toolAllowlist union
    const mergedTools = a.toolAllowlist || b.toolAllowlist
      ? [...new Set([...(a.toolAllowlist ?? []), ...(b.toolAllowlist ?? [])])]
      : undefined;

    // tags union
    const mergedTags = [...new Set([...(a.tags ?? []), ...(b.tags ?? [])])];

    // description — use LLM if both have distinct descriptions, otherwise concat
    const mergedDescription = await this.mergeDescriptions(a.description, b.description, nameA, nameB);

    const mergedName = opts.mergedName ?? `${nameA}-${nameB}-merged`;

    const mergedMcpServer = a.mcpServer ?? b.mcpServer;
    const merged: SkillDefinition = {
      name: mergedName,
      version: '1.0.0',
      description: mergedDescription,
      author: 'ai-desk-merger',
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      ...(mergedMcpServer ? { mcpServer: mergedMcpServer } : {}),
      systemPromptAddition: mergedPromptAddition,
      toolAllowlist: mergedTools,
      provenance: 'generated',
      revision: 1,
      sourceSessionId: a.sourceSessionId ?? `merged:${nameA}+${nameB}`,
      parentSkill: nameA,
      createdAt: Date.now(),
      kind: mergedKind,
      scope: mergedScope,
      allowedAgents: mergedAllowedAgents,
    };

    // Validate
    const errors = checkGeneratedSkillDefinition(merged);
    if (errors) {
      return {
        dryRun: opts.dryRun ?? false,
        errors: [`Merged skill failed validation:\n${errors.join('\n')}`],
      };
    }

    if (opts.dryRun) {
      return { merged, dryRun: true };
    }

    // Write to disk
    mkdirSync(this.outputDir, { recursive: true });
    const fileName = `${merged.name}.skill.json`;
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');

    // Register as pending approval
    this.registry.registerGenerated(merged, filePath, { connectionId: opts.agentId });

    eventBus.emit('skills:merged', { nameA, nameB, mergedName, agentId: opts.agentId });

    return { merged, filePath, dryRun: false };
  }

  /**
   * After a merged skill is approved, archive its two source skills.
   * Call this in the approval handler, not automatically on merge.
   */
  archiveSources(nameA: string, nameB: string, actor?: { connectionId?: string }): void {
    this.registry.archive(nameA, actor);
    this.registry.archive(nameB, actor);
    eventBus.emit('skills:merge:sources-archived', { nameA, nameB });
  }

  private async mergeDescriptions(descA: string, descB: string, nameA: string, nameB: string): Promise<string> {
    if (descA === descB) return descA;

    try {
      const result = await this.router.call({
        preferredModel: this.router.pickModel({ complexity: 'simple' }),
        messages: [{
          role: 'user',
          content: `Merge these two skill descriptions into a single 1-2 sentence description that captures both:\n\nSkill A (${nameA}): ${descA}\nSkill B (${nameB}): ${descB}\n\nOutput ONLY the merged description text, no quotes or explanation.`,
        }],
        systemPrompt: 'You are a concise technical writer. Output only the requested text.',
        maxTokens: 128,
        temperature: 0.2,
      });
      return result.content.trim();
    } catch {
      return `${descA} Also: ${descB}`;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) { if (b.has(x)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

function narrowestScope(
  a: SkillDefinition['scope'],
  b: SkillDefinition['scope'],
): SkillDefinition['scope'] {
  const order = { agent: 0, project: 1, global: 2 };
  const sa = order[a ?? 'project'];
  const sb = order[b ?? 'project'];
  if (sa <= sb) return a ?? 'project';
  return b ?? 'project';
}

function mergePromptAdditions(a?: string, b?: string): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return `${a.trimEnd()}\n\n${b.trimStart()}`;
}
