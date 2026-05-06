/**
 * AI_DESK — Skill Evaluator
 *
 * Runs a skill against a set of golden tasks and reports a pass/fail score.
 * Does NOT execute real tools — it asks the LLM to judge whether the skill's
 * systemPromptAddition would lead to the expected outcome on the given prompt.
 *
 * Golden task format: evals/golden/*.eval.json
 * {
 *   id: string,
 *   description: string,
 *   prompt: string,
 *   expectedOutcome: string,
 *   expectedToolCalls?: string[],   // optional — tool names expected to be used
 *   tags?: string[],
 *   skill?: string                  // if set, only run this eval for that skill
 * }
 *
 * The evaluator does one LLM call per (skill, eval) pair using a simple judge prompt.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { ModelRouter } from '../models/model-router.js';
import type { SkillRegistry } from './skill-registry.js';
import { eventBus } from '../shared/events.js';

export interface GoldenTask {
  id: string;
  description: string;
  prompt: string;
  expectedOutcome: string;
  expectedToolCalls?: string[];
  tags?: string[];
  /** If set, only evaluated against this specific skill */
  skill?: string;
}

export interface EvalResult {
  taskId: string;
  skillName: string;
  passed: boolean;
  score: number; // 0.0–1.0
  reasoning: string;
  durationMs: number;
}

export interface EvalReport {
  skillName: string;
  totalTasks: number;
  passed: number;
  failed: number;
  score: number; // 0.0–1.0
  results: EvalResult[];
  ranAt: number;
}

export interface EvalOptions {
  /** Only run evals with these tags */
  tags?: string[];
  /** Override golden tasks directory */
  goldenDir?: string;
  /** Run ALL enabled skills, not just the named one */
  allSkills?: boolean;
}

export class SkillEvaluator {
  private registry: SkillRegistry;
  private router: ModelRouter;
  private goldenDir: string;

  constructor(deps: {
    registry: SkillRegistry;
    router: ModelRouter;
    /** Directory containing *.eval.json files */
    goldenDir?: string;
  }) {
    this.registry = deps.registry;
    this.router = deps.router;
    this.goldenDir = deps.goldenDir ?? resolve(process.cwd(), 'evals', 'golden');
  }

  /** Load all golden tasks from the evals directory */
  loadGoldenTasks(goldenDir?: string, filterTags?: string[]): GoldenTask[] {
    const dir = goldenDir ?? this.goldenDir;
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter(f => f.endsWith('.eval.json'));
    const tasks: GoldenTask[] = [];

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as GoldenTask;
        if (filterTags && filterTags.length > 0) {
          if (!raw.tags?.some(t => filterTags.includes(t))) continue;
        }
        tasks.push(raw);
      } catch {
        // skip malformed evals
      }
    }

    return tasks;
  }

  /** Evaluate a single skill against all matching golden tasks */
  async evalSkill(skillName: string, opts: EvalOptions = {}): Promise<EvalReport> {
    const loaded = this.registry.get(skillName);
    if (!loaded) {
      return {
        skillName,
        totalTasks: 0,
        passed: 0,
        failed: 0,
        score: 0,
        results: [],
        ranAt: Date.now(),
      };
    }

    const allTasks = this.loadGoldenTasks(opts.goldenDir, opts.tags);
    // Filter to tasks relevant to this skill (no skill filter = applies to all)
    const tasks = allTasks.filter(t => !t.skill || t.skill === skillName);

    const results: EvalResult[] = [];
    for (const task of tasks) {
      const result = await this.runOneEval(loaded.definition, task);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const score = results.length > 0 ? passed / results.length : 0;

    eventBus.emit('skills:synth:started', { skillName, mode: 'eval', taskCount: tasks.length });

    return {
      skillName,
      totalTasks: results.length,
      passed,
      failed: results.length - passed,
      score,
      results,
      ranAt: Date.now(),
    };
  }

  /** Evaluate ALL enabled skills in the registry */
  async evalAll(opts: EvalOptions = {}): Promise<EvalReport[]> {
    const skills = this.registry.list().filter(s => s.state.enabled);
    const reports: EvalReport[] = [];
    for (const skill of skills) {
      reports.push(await this.evalSkill(skill.definition.name, opts));
    }
    return reports;
  }

  private async runOneEval(
    skill: import('./skill.js').SkillDefinition,
    task: GoldenTask,
  ): Promise<EvalResult> {
    const start = Date.now();

    const systemContext = skill.systemPromptAddition
      ? `The agent has this skill active:\n\n${skill.systemPromptAddition}`
      : `The agent has no skill-specific instructions.`;

    const toolContext = skill.toolAllowlist?.length
      ? `Allowed tools: ${skill.toolAllowlist.join(', ')}`
      : '';

    const expectedTools = task.expectedToolCalls?.length
      ? `Expected tools to be called: ${task.expectedToolCalls.join(', ')}`
      : '';

    const judgePrompt = `You are evaluating whether an AI agent skill helps achieve the expected outcome for a given task.

## Skill
${systemContext}
${toolContext}

## Task
User prompt: ${task.prompt}

## Expected outcome
${task.expectedOutcome}
${expectedTools}

## Question
Given the skill's instructions, would the agent be more likely to achieve the expected outcome?
Consider whether the skill's systemPromptAddition guides the agent toward the expected behavior.

Respond with a JSON object:
{
  "passed": true|false,
  "score": 0.0-1.0,
  "reasoning": "one sentence explanation"
}`;

    try {
      const response = await this.router.call({
        preferredModel: this.router.pickModel({ complexity: 'simple' }),
        messages: [{ role: 'user', content: judgePrompt }],
        systemPrompt: 'You are a precise evaluator. Output only valid JSON. No markdown.',
        maxTokens: 256,
        temperature: 0,
      });

      const json = extractJson(response.content);
      const parsed = JSON.parse(json) as { passed: boolean; score: number; reasoning: string };

      return {
        taskId: task.id,
        skillName: skill.name,
        passed: Boolean(parsed.passed),
        score: Math.max(0, Math.min(1, Number(parsed.score) || 0)),
        reasoning: String(parsed.reasoning ?? ''),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        taskId: task.id,
        skillName: skill.name,
        passed: false,
        score: 0,
        reasoning: `Eval error: ${(err as Error).message}`,
        durationMs: Date.now() - start,
      };
    }
  }
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
