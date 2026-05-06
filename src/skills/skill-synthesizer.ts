/**
 * AI_DESK — Skill Synthesizer
 *
 * Converts a session trace into a reusable skill definition.
 * Security invariants enforced here:
 *   - No mcpServer in output
 *   - toolAllowlist ⊆ session's allowed tools
 *   - Rate limit checked before LLM call
 *   - PII scrubbed before trace leaves this module
 *   - Output validated via typebox before written to disk
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ModelRouter } from '../models/model-router.js';
import type { BudgetTracker } from '../budget/budget-tracker.js';
import type { SkillTraceStore } from '../memory/skill-trace-store.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillRateLimiter } from './skill-rate-limit.js';
import type { SkillSynthesisConfig } from '../config/schema.js';
import type { SkillDefinition } from './skill.js';
import { checkGeneratedSkillDefinition } from './skill.schema.js';
import { scrubTrace } from '../security/pii-scrub.js';
import { eventBus } from '../shared/events.js';

export interface SynthesisOptions {
  /** If true, run the full pipeline but do not write to disk or register */
  dryRun?: boolean;
  /** Override agent ID for rate limiting */
  agentId?: string;
  /** Project root for PII path scrubbing */
  projectRoot?: string;
  /** Tools allowed in the source session (toolAllowlist must be a subset) */
  sessionAllowedTools?: string[];
  /**
   * 'positive' (default) = capability-adding skill.
   * 'avoid' = cautionary anti-skill synthesized from failure traces.
   */
  synthesisKind?: 'positive' | 'avoid';
}

export interface SynthesisResult {
  skill?: SkillDefinition;
  filePath?: string;
  /** True if a very similar skill already exists */
  isDuplicate: boolean;
  /** Name of the existing skill if isDuplicate */
  duplicateOf?: string;
  errors?: string[];
  dryRun: boolean;
  rateLimited?: boolean;
  budgetBlocked?: boolean;
}

export class SkillSynthesizer {
  private traceStore: SkillTraceStore;
  private registry: SkillRegistry;
  private router: ModelRouter;
  private budget: BudgetTracker;
  private rateLimiter: SkillRateLimiter;
  private config: SkillSynthesisConfig;
  private outputDir: string;
  private promptTemplate: string;
  private avoidPromptTemplate: string;

  constructor(deps: {
    traceStore: SkillTraceStore;
    registry: SkillRegistry;
    router: ModelRouter;
    budget: BudgetTracker;
    rateLimiter: SkillRateLimiter;
    config: SkillSynthesisConfig;
    /** Directory to write generated skills (e.g. skills/generated) */
    outputDir: string;
    /** Override prompt template path (for testing) */
    promptTemplatePath?: string;
    /** Override avoid prompt template path (for testing) */
    avoidPromptTemplatePath?: string;
  }) {
    this.traceStore = deps.traceStore;
    this.registry = deps.registry;
    this.router = deps.router;
    this.budget = deps.budget;
    this.rateLimiter = deps.rateLimiter;
    this.config = deps.config;
    this.outputDir = deps.outputDir;

    const templatePath = deps.promptTemplatePath
      ?? resolve(process.cwd(), 'prompts', 'skill-synthesis.v1.md');

    this.promptTemplate = existsSync(templatePath)
      ? readFileSync(templatePath, 'utf-8')
      : DEFAULT_PROMPT_FALLBACK;

    const avoidPath = deps.avoidPromptTemplatePath
      ?? resolve(process.cwd(), 'prompts', 'skill-synthesis-avoid.v1.md');

    this.avoidPromptTemplate = existsSync(avoidPath)
      ? readFileSync(avoidPath, 'utf-8')
      : DEFAULT_AVOID_FALLBACK;
  }

  async synthesize(sessionIds: string[], opts: SynthesisOptions = {}): Promise<SynthesisResult> {
    const agentId = opts.agentId ?? 'global';

    // 1. Rate limit check
    if (!opts.dryRun) {
      const rl = this.rateLimiter.checkAndRecord(agentId);
      if (!rl.allowed) {
        return { isDuplicate: false, dryRun: false, rateLimited: true, errors: [rl.reason!] };
      }
    }

    // 2. Fetch and merge traces
    const allTurns = sessionIds.flatMap(id => this.traceStore.getTrace(id));
    if (allTurns.length === 0) {
      return { isDuplicate: false, dryRun: opts.dryRun ?? false, errors: ['No turns found for provided session IDs'] };
    }

    const primarySession = this.traceStore.getSession(sessionIds[0]);
    if (!primarySession) {
      return { isDuplicate: false, dryRun: opts.dryRun ?? false, errors: [`Session ${sessionIds[0]} not found`] };
    }

    // 3. PII scrub
    const scrubbedTurns = scrubTrace(allTurns, opts.projectRoot);

    // 4. Budget check
    const budgetCheck = this.budget.check(agentId, 2000); // rough estimate
    if (!budgetCheck.allowed) {
      return { isDuplicate: false, dryRun: opts.dryRun ?? false, budgetBlocked: true, errors: [budgetCheck.reason ?? 'Budget exceeded'] };
    }

    // 5. Pick model (fallback to haiku when budget is low)
    let model = this.config.model;
    if (this.config.fallbackToHaikuUnderBudget && budgetCheck.warning) {
      model = this.config.scrubModel; // haiku
    }

    // 6. Build trace content for prompt
    const traceContent = formatTrace(scrubbedTurns);
    const traceHash = computeHash(traceContent);
    const allowedTools = opts.sessionAllowedTools ?? primarySession.skillsUsed;
    const synthesisKind = opts.synthesisKind ?? 'positive';
    const template = synthesisKind === 'avoid' ? this.avoidPromptTemplate : this.promptTemplate;

    const userPrompt = template
      .replace(/\{\{SESSION_ID\}\}/g, sessionIds[0])
      .replace(/\{\{TRACE_HASH\}\}/g, traceHash)
      .replace(/\{\{MODEL_ID\}\}/g, model)
      .replace(/\{\{CREATED_AT\}\}/g, String(Date.now()))
      .replace(/\{\{AGENT_ID\}\}/g, primarySession.agentId)
      .replace(/\{\{OUTCOME\}\}/g, primarySession.outcome ?? 'unknown')
      .replace(/\{\{TOOL_COUNT\}\}/g, String(primarySession.toolCount))
      .replace(/\{\{ALLOWED_TOOLS\}\}/g, allowedTools.length > 0 ? allowedTools.join(', ') : '(none — do not set toolAllowlist)')
      .replace(/\{\{TRACE_CONTENT\}\}/g, traceContent);

    eventBus.emit('skills:synth:started', { sessionIds, agentId, dryRun: opts.dryRun });

    // 7. LLM call
    let rawOutput: string;
    try {
      const result = await this.router.call({
        preferredModel: model,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt: 'You are a skill synthesizer. Output only valid JSON. No markdown, no explanation.',
        maxTokens: 1024,
        temperature: 0.2,
      });
      rawOutput = result.content;
    } catch (err) {
      eventBus.emit('skills:synth:failed', { sessionIds, agentId, error: (err as Error).message });
      return {
        isDuplicate: false,
        dryRun: opts.dryRun ?? false,
        errors: [`LLM call failed: ${(err as Error).message}`],
      };
    }

    // 8. Parse JSON
    let parsed: unknown;
    try {
      const jsonStr = extractJson(rawOutput);
      parsed = JSON.parse(jsonStr);
    } catch {
      eventBus.emit('skills:synth:failed', { sessionIds, agentId, error: 'JSON parse failed' });
      return {
        isDuplicate: false,
        dryRun: opts.dryRun ?? false,
        errors: [`Failed to parse LLM output as JSON: ${rawOutput.slice(0, 200)}`],
      };
    }

    // 9. Validate schema (also enforces no mcpServer, provenance=generated)
    const validationErrors = checkGeneratedSkillDefinition(parsed);
    if (validationErrors) {
      eventBus.emit('skills:synth:failed', { sessionIds, agentId, error: 'Validation failed' });
      return {
        isDuplicate: false,
        dryRun: opts.dryRun ?? false,
        errors: [`Generated skill failed validation:\n${validationErrors.join('\n')}`],
      };
    }

    const definition = parsed as SkillDefinition;

    // Enforce requested kind (LLM may not always set it correctly)
    definition.kind = synthesisKind;

    // 10. toolAllowlist subset check
    if (definition.toolAllowlist && allowedTools.length > 0) {
      const forbidden = definition.toolAllowlist.filter(t => !allowedTools.includes(t));
      if (forbidden.length > 0) {
        return {
          isDuplicate: false,
          dryRun: opts.dryRun ?? false,
          errors: [`toolAllowlist contains tools not in session allowlist: ${forbidden.join(', ')}`],
        };
      }
    }

    // 11. Dedup check
    const { isDuplicate, duplicateOf } = this.checkDuplicate(definition);
    if (isDuplicate && !opts.dryRun) {
      return { skill: definition, isDuplicate: true, duplicateOf, dryRun: false };
    }

    if (opts.dryRun) {
      return { skill: definition, isDuplicate, duplicateOf, dryRun: true };
    }

    // 12. Write to disk
    mkdirSync(this.outputDir, { recursive: true });
    const fileName = `${definition.name}.skill.json`;
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, JSON.stringify(definition, null, 2), 'utf-8');

    // 13. Register (disabled, pending approval)
    this.registry.registerGenerated(definition, filePath, { connectionId: agentId });

    return { skill: definition, filePath, isDuplicate: false, dryRun: false };
  }

  /**
   * Jaccard similarity on tags + description word overlap.
   * Returns true if similarity > 0.7 with any existing skill.
   */
  private checkDuplicate(candidate: SkillDefinition): { isDuplicate: boolean; duplicateOf?: string } {
    const candTags = new Set((candidate.tags ?? []).map(t => t.toLowerCase()));
    const candWords = descriptionWords(candidate.description);

    for (const existing of this.registry.list()) {
      const existTags = new Set((existing.definition.tags ?? []).map(t => t.toLowerCase()));
      const existWords = descriptionWords(existing.definition.description);

      const tagSim = jaccard(candTags, existTags);
      const wordSim = jaccard(candWords, existWords);
      const combined = (tagSim + wordSim) / 2;

      if (combined > 0.7) {
        return { isDuplicate: true, duplicateOf: existing.definition.name };
      }
    }
    return { isDuplicate: false };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTrace(turns: ReturnType<typeof scrubTrace>): string {
  return turns.map(t => {
    if (t.role === 'tool') {
      return `[tool: ${t.toolName ?? 'unknown'}]\ninput: ${JSON.stringify(t.toolInput ?? {})}\noutput: ${(t.toolOutput ?? '').slice(0, 500)}`;
    }
    return `[${t.role}]\n${t.content.slice(0, 1000)}`;
  }).join('\n\n---\n\n');
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Find first { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function descriptionWords(desc: string): Set<string> {
  return new Set(
    desc.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) { if (b.has(x)) intersection++; }
  const union = a.size + b.size - intersection;
  return intersection / union;
}

const DEFAULT_PROMPT_FALLBACK = `Analyze the session trace and produce a skill JSON with fields: name, version, description, provenance="generated", revision=1, sourceSessionId="{{SESSION_ID}}", traceHash="{{TRACE_HASH}}", modelId="{{MODEL_ID}}", promptTemplateVersion="skill-synthesis.v1", createdAt={{CREATED_AT}}, kind="positive", scope="project". No mcpServer. Trace:\n\n{{TRACE_CONTENT}}`;

const DEFAULT_AVOID_FALLBACK = `Analyze this FAILURE trace and produce an anti-skill JSON with the SAME schema but kind="avoid". The systemPromptAddition should warn against the failure pattern. Fields: name (kebab-case ending in -avoid), version="1.0.0", provenance="generated", revision=1, kind="avoid", scope="project". No mcpServer. Trace:\n\n{{TRACE_CONTENT}}`;
