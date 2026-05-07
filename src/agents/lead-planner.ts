/**
 * AI_DESK — Lead Planner
 *
 * Generates a pre-flight permission manifest by asking the lead agent to
 * enumerate all tools its team will need before execution begins.
 * The manifest is stored in ManifestStore with status 'pending' until
 * the user approves or rejects it via the dashboard.
 */
import type { ModelRouter } from '../models/model-router.js';
import type { ManifestStore } from '../tools/manifest-store.js';
import type { ToolManifest, ManifestEntry } from '../shared/types.js';
import type { TaskDefinition } from '../orchestration/task-graph.js';

export interface PlanFromTasksParams {
  goal: string;
  teamId: string;
  teamName: string;
  /** Tasks produced by the decompose phase — tells the planner what agents will do */
  tasks: TaskDefinition[];
  /** Model preferred by the lead agent */
  preferredModel?: string;
  /** taskId to attach to the manifest for traceability */
  taskId?: string;
}

interface RawManifest {
  steps?: { title: string; intent: string }[];
  entries?: ManifestEntry[];
  riskSelfAssessment?: 'low' | 'medium' | 'high';
}

const VALID_RISK = new Set<string>(['low', 'medium', 'high']);
const VALID_SCOPE_KINDS = new Set<string>(['path', 'domain', 'command-class', 'any']);
const VALID_CMD_CLASSES = new Set<string>(['build', 'vcs-readonly', 'vcs-write', 'destructive', 'custom']);

export class LeadPlanner {
  private router: ModelRouter;
  private manifests: ManifestStore;

  constructor(router: ModelRouter, manifests: ManifestStore) {
    this.router = router;
    this.manifests = manifests;
  }

  /**
   * Call the lead agent model to produce a permission manifest from a task list.
   * Returns a pending ToolManifest that must be approved before team execution.
   */
  async planFromTasks(params: PlanFromTasksParams): Promise<ToolManifest> {
    const taskSummary = params.tasks
      .map(t => `  • [${t.agentId}] ${t.label ?? t.id}: ${(t.prompt ?? '').slice(0, 120)}`)
      .join('\n');

    const prompt =
      `You are the lead coordinator of team "${params.teamName}".\n\n` +
      `Goal: ${params.goal}\n\n` +
      `Your team will execute these tasks:\n${taskSummary}\n\n` +
      `Before execution begins, declare every tool your team will need.\n\n` +
      `Reply with ONLY valid JSON matching this exact schema (no markdown, no explanation):\n` +
      `{\n` +
      `  "steps": [{ "title": string, "intent": string }],\n` +
      `  "entries": [\n` +
      `    {\n` +
      `      "tool": string,\n` +
      `      "scopes": [\n` +
      `        { "kind": "path", "glob": "/workspace/**" }\n` +
      `        | { "kind": "domain", "pattern": "api.github.com" }\n` +
      `        | { "kind": "command-class", "class": "build"|"vcs-readonly"|"vcs-write"|"destructive"|"custom" }\n` +
      `        | { "kind": "any" }\n` +
      `      ],\n` +
      `      "purpose": string,\n` +
      `      "estimatedCalls": number\n` +
      `    }\n` +
      `  ],\n` +
      `  "riskSelfAssessment": "low" | "medium" | "high"\n` +
      `}\n\n` +
      `Tool name examples: write_file, read_file, shell, fetch_url, grep, glob\n` +
      `Scope guidelines:\n` +
      `  - File tools → { "kind": "path", "glob": "/workspace/proj/**" }\n` +
      `  - Shell → { "kind": "command-class", "class": "build" }\n` +
      `  - Network → { "kind": "domain", "pattern": "api.github.com" }\n` +
      `  - Read-only (grep/glob/read) → { "kind": "any" }\n` +
      `Assess risk as "low" if only reading/building, "medium" if writing files, "high" if running destructive or network commands.`;

    const result = await this.router.call({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt:
        'You produce machine-readable JSON only. No prose, no markdown fences. ' +
        'Follow the schema exactly. Missing fields default to empty arrays.',
      maxTokens: 2048,
      temperature: 0.2,
      preferredModel: params.preferredModel,
    });

    const raw = this.parseManifestJson(result.content);

    return this.manifests.create({
      taskId: params.taskId ?? `${params.teamId}:plan`,
      teamId: params.teamId,
      sessionId: params.teamId,    // use teamId as session scope for manifest lookup
      goal: params.goal,
      steps: raw.steps ?? [],
      entries: raw.entries ?? [],
      riskSelfAssessment: raw.riskSelfAssessment ?? 'medium',
    });
  }

  private parseManifestJson(content: string): RawManifest {
    try {
      const cleaned = content.trim()
        .replace(/^```(?:json)?\r?\n?/, '')
        .replace(/\r?\n?```\s*$/, '')
        .trim();
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        steps: this.parseSteps(obj['steps']),
        entries: this.parseEntries(obj['entries']),
        riskSelfAssessment: VALID_RISK.has(String(obj['riskSelfAssessment'] ?? ''))
          ? obj['riskSelfAssessment'] as 'low' | 'medium' | 'high'
          : 'medium',
      };
    } catch {
      // Fail-closed: return empty manifest — user will see it and can reject or edit
      return { steps: [], entries: [], riskSelfAssessment: 'high' };
    }
  }

  private parseSteps(raw: unknown): { title: string; intent: string }[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(s => s && typeof s === 'object')
      .map(s => ({
        title: String((s as Record<string, unknown>)['title'] ?? ''),
        intent: String((s as Record<string, unknown>)['intent'] ?? ''),
      }))
      .filter(s => s.title);
  }

  private parseEntries(raw: unknown): ManifestEntry[] {
    if (!Array.isArray(raw)) return [];
    const entries: ManifestEntry[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const tool = String(e['tool'] ?? '').trim();
      if (!tool) continue;
      const scopes = this.parseScopes(e['scopes']);
      if (scopes.length === 0) continue;
      entries.push({
        tool,
        scopes,
        purpose: String(e['purpose'] ?? ''),
        estimatedCalls: typeof e['estimatedCalls'] === 'number' ? e['estimatedCalls'] : undefined,
      });
    }
    return entries;
  }

  private parseScopes(raw: unknown): ManifestEntry['scopes'] {
    if (!Array.isArray(raw)) return [];
    const result: ManifestEntry['scopes'] = [];
    for (const s of raw) {
      if (!s || typeof s !== 'object') continue;
      const scope = s as Record<string, unknown>;
      const kind = String(scope['kind'] ?? '');
      if (!VALID_SCOPE_KINDS.has(kind)) continue;

      if (kind === 'any') { result.push({ kind: 'any' }); continue; }
      if (kind === 'path') {
        const glob = String(scope['glob'] ?? '').trim();
        if (glob) result.push({ kind: 'path', glob });
        continue;
      }
      if (kind === 'domain') {
        const pattern = String(scope['pattern'] ?? '').trim();
        if (pattern) result.push({ kind: 'domain', pattern });
        continue;
      }
      if (kind === 'command-class') {
        const cls = String(scope['class'] ?? '').trim();
        if (!VALID_CMD_CLASSES.has(cls)) continue;
        const commands = Array.isArray(scope['commands'])
          ? (scope['commands'] as unknown[]).map(String)
          : undefined;
        result.push({ kind: 'command-class', class: cls as 'build' | 'vcs-readonly' | 'vcs-write' | 'destructive' | 'custom', commands });
        continue;
      }
    }
    return result;
  }
}
