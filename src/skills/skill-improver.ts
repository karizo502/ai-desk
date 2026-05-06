/**
 * AI_DESK — Skill Improver
 *
 * Detects underperforming skills and generates revised versions.
 * Triggered when: uses >= minUsesBeforeImprovement AND failure_rate > failureRateThreshold.
 *
 * Pipeline:
 *   1. Scan registry for improvement candidates
 *   2. Fetch failure traces from SkillTraceStore
 *   3. PII-scrub traces
 *   4. Call LLM with current skill + failure context (skill-improve.v1.md)
 *   5. Validate revised definition (same security guards as synthesizer)
 *   6. Run SkillSandbox replay to gate regression
 *   7. Register revised skill as pending approval (parentSkill, revision++)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ModelRouter } from '../models/model-router.js';
import type { BudgetTracker } from '../budget/budget-tracker.js';
import type { SkillTraceStore } from '../memory/skill-trace-store.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillSynthesisConfig } from '../config/schema.js';
import type { SkillDefinition } from './skill.js';
import { checkGeneratedSkillDefinition } from './skill.schema.js';
import { scrubTrace } from '../security/pii-scrub.js';
import { SkillSandbox } from './skill-sandbox.js';
import { eventBus } from '../shared/events.js';

export interface ImprovementOptions {
  dryRun?: boolean;
  agentId?: string;
  projectRoot?: string;
}

export interface ImprovementResult {
  skillName: string;
  revised?: SkillDefinition;
  filePath?: string;
  dryRun: boolean;
  /** Reason improvement was skipped (below threshold, not enough uses, budget, etc.) */
  skipped?: string;
  /** Sandbox gate rejected the revision */
  sandboxRejected?: boolean;
  errors?: string[];
}

export class SkillImprover {
  private traceStore: SkillTraceStore;
  private registry: SkillRegistry;
  private router: ModelRouter;
  private budget: BudgetTracker;
  private sandbox: SkillSandbox;
  private config: SkillSynthesisConfig;
  private outputDir: string;
  private promptTemplate: string;

  constructor(deps: {
    traceStore: SkillTraceStore;
    registry: SkillRegistry;
    router: ModelRouter;
    budget: BudgetTracker;
    config: SkillSynthesisConfig;
    outputDir: string;
    promptTemplatePath?: string;
  }) {
    this.traceStore = deps.traceStore;
    this.registry = deps.registry;
    this.router = deps.router;
    this.budget = deps.budget;
    this.config = deps.config;
    this.outputDir = deps.outputDir;
    this.sandbox = new SkillSandbox(deps.router);

    const templatePath = deps.promptTemplatePath
      ?? resolve(process.cwd(), 'prompts', 'skill-improve.v1.md');

    this.promptTemplate = existsSync(templatePath)
      ? readFileSync(templatePath, 'utf-8')
      : DEFAULT_IMPROVE_FALLBACK;
  }

  /** Returns all enabled skills that qualify for improvement */
  findCandidates(): SkillDefinition[] {
    const { minUsesBeforeImprovement, failureRateThreshold } = this.config;
    return this.registry.list()
      .filter(s => s.state.enabled && s.state.metrics !== undefined)
      .filter(s => {
        const m = s.state.metrics!;
        if (m.uses < minUsesBeforeImprovement) return false;
        const failureRate = m.uses > 0 ? m.failures / m.uses : 0;
        return failureRate > failureRateThreshold;
      })
      .map(s => s.definition);
  }

  /** Improve a single skill by name. Returns an ImprovementResult. */
  async improve(skillName: string, opts: ImprovementOptions = {}): Promise<ImprovementResult> {
    const loaded = this.registry.get(skillName);
    if (!loaded) {
      return { skillName, dryRun: opts.dryRun ?? false, errors: [`Skill "${skillName}" not found`] };
    }

    const { definition, state } = loaded;
    const m = state.metrics;
    if (!m || m.uses < this.config.minUsesBeforeImprovement) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        skipped: `Not enough uses (${m?.uses ?? 0}/${this.config.minUsesBeforeImprovement})`,
      };
    }

    const failureRate = m.failures / m.uses;
    if (failureRate <= this.config.failureRateThreshold) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        skipped: `Failure rate ${(failureRate * 100).toFixed(1)}% is below threshold ${(this.config.failureRateThreshold * 100).toFixed(1)}%`,
      };
    }

    // Budget check
    const budgetCheck = this.budget.check(opts.agentId ?? 'global', 2000);
    if (!budgetCheck.allowed) {
      return { skillName, dryRun: opts.dryRun ?? false, errors: [budgetCheck.reason ?? 'Budget exceeded'] };
    }

    // Fetch failure traces for this skill
    const failureTraces = await this.fetchFailureTraces(skillName, 5);

    if (failureTraces.length === 0) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        skipped: 'No failure traces found to learn from',
      };
    }

    // PII scrub
    const scrubbedTraces = failureTraces.flatMap(t => scrubTrace(t, opts.projectRoot));

    const traceContent = scrubbedTraces
      .slice(0, 3) // max 3 failure trace summaries
      .map((t, i) => `### Failure trace ${i + 1}\n${t.content.slice(0, 600)}`)
      .join('\n\n');

    const traceHash = createHash('sha256')
      .update(traceContent)
      .digest('hex')
      .slice(0, 16);

    const nextRevision = (definition.revision ?? 1) + 1;
    const nextVersion = bumpVersion(definition.version ?? '1.0.0');
    const model = this.config.improvementModel;
    const allowedTools = definition.toolAllowlist ?? [];

    const prompt = this.promptTemplate
      .replace(/\{\{SKILL_NAME\}\}/g, skillName)
      .replace(/\{\{SKILL_DESCRIPTION\}\}/g, definition.description)
      .replace(/\{\{CURRENT_SYSTEM_PROMPT_ADDITION\}\}/g, definition.systemPromptAddition ?? '(none)')
      .replace(/\{\{USES\}\}/g, String(m.uses))
      .replace(/\{\{FAILURES\}\}/g, String(m.failures))
      .replace(/\{\{FAILURE_RATE\}\}/g, (failureRate * 100).toFixed(1))
      .replace(/\{\{FAILURE_TRACES\}\}/g, traceContent)
      .replace(/\{\{NEXT_REVISION\}\}/g, String(nextRevision))
      .replace(/\{\{NEXT_VERSION\}\}/g, nextVersion)
      .replace(/\{\{SOURCE_SESSION_ID\}\}/g, definition.sourceSessionId ?? 'unknown')
      .replace(/\{\{TRACE_HASH\}\}/g, traceHash)
      .replace(/\{\{MODEL_ID\}\}/g, model)
      .replace(/\{\{ALLOWED_TOOLS\}\}/g, allowedTools.length > 0 ? allowedTools.join(', ') : '(none)');

    eventBus.emit('skills:synth:started', { skillName, agentId: opts.agentId, mode: 'improve' });

    // LLM call
    let rawOutput: string;
    try {
      const result = await this.router.call({
        preferredModel: model,
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: 'You are a skill improvement specialist. Output only valid JSON. No markdown, no explanation.',
        maxTokens: 1024,
        temperature: 0.3,
      });
      rawOutput = result.content;
    } catch (err) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        errors: [`LLM call failed: ${(err as Error).message}`],
      };
    }

    // Parse JSON
    let parsed: unknown;
    try {
      const jsonStr = extractJson(rawOutput);
      parsed = JSON.parse(jsonStr);
    } catch {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        errors: [`Failed to parse LLM output: ${rawOutput.slice(0, 200)}`],
      };
    }

    // Validate (same security guards as synthesizer)
    const validationErrors = checkGeneratedSkillDefinition(parsed);
    if (validationErrors) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        errors: [`Validation failed:\n${validationErrors.join('\n')}`],
      };
    }

    const revised = parsed as SkillDefinition;

    // Enforce revision > current
    if ((revised.revision ?? 1) <= (definition.revision ?? 1)) {
      return {
        skillName,
        dryRun: opts.dryRun ?? false,
        errors: [`LLM returned revision ${revised.revision ?? 1} which is not higher than current ${definition.revision ?? 1}`],
      };
    }

    // Sandbox gate — only skip replay if no traces available
    if (failureTraces.length > 0) {
      const replayTurns = failureTraces[0];
      const sandboxResult = await this.sandbox.replay(revised, replayTurns);
      if (sandboxResult.ok && sandboxResult.estimatedTokenDelta > 500) {
        // Revision makes things significantly worse — reject
        return {
          skillName,
          revised,
          dryRun: opts.dryRun ?? false,
          sandboxRejected: true,
        };
      }
    }

    if (opts.dryRun) {
      return { skillName, revised, dryRun: true };
    }

    // Write to disk
    mkdirSync(this.outputDir, { recursive: true });
    const fileName = `${revised.name}.v${revised.revision}.skill.json`;
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, JSON.stringify(revised, null, 2), 'utf-8');

    // Register as pending approval
    this.registry.registerGenerated(revised, filePath, { connectionId: opts.agentId });

    eventBus.emit('skills:revised', { skillName, revision: revised.revision });

    return { skillName, revised, filePath, dryRun: false };
  }

  /** Run improvement check across all qualifying skills */
  async improveAll(opts: ImprovementOptions = {}): Promise<ImprovementResult[]> {
    const candidates = this.findCandidates();
    const results: ImprovementResult[] = [];
    for (const def of candidates) {
      results.push(await this.improve(def.name, opts));
    }
    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fetchFailureTraces(skillName: string, limit: number): Promise<import('../memory/skill-trace-store.js').TracedTurn[][]> {
    const failureSessions = this.traceStore.listFailureSessionsForSkill(skillName, limit);
    return failureSessions
      .map(s => this.traceStore.getTrace(s.id))
      .filter(turns => turns.length > 0);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function bumpVersion(version: string): string {
  const parts = version.split('.').map(Number);
  if (parts.length >= 3) {
    parts[1] = (parts[1] ?? 0) + 1;
    parts[2] = 0;
    return parts.join('.');
  }
  return version;
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

// Fallback prompt used when the template file is absent (tests + offline use)
const DEFAULT_IMPROVE_FALLBACK = `Improve the skill "{{SKILL_NAME}}" based on these failure traces:

{{FAILURE_TRACES}}

Current systemPromptAddition:
{{CURRENT_SYSTEM_PROMPT_ADDITION}}

Output valid JSON with the same name, revision={{NEXT_REVISION}}, parentSkill="{{SKILL_NAME}}", provenance="generated".`;
