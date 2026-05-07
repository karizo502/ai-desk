/**
 * AI_DESK — Team Coordinator
 *
 * Runs a team against a goal in three phases:
 *   1. Lead agent decomposes the goal into a JSON task list
 *   2. Orchestrator executes tasks (may be parallel)
 *   3. Lead agent synthesises all results into a final answer
 *
 * Supports persistent Team Projects: each run is persisted to SQLite so it
 * can be resumed after failure, and project state (artifacts, brief, history)
 * is injected into the decompose prompt so the lead agent modifies existing
 * work instead of recreating it from scratch.
 */
import { resolve, isAbsolute } from 'node:path';
import type { AgentRuntime } from '../agents/agent-runtime.js';
import { Orchestrator } from '../orchestration/orchestrator.js';
import type { TaskDefinition } from '../orchestration/task-graph.js';
import { eventBus } from '../shared/events.js';
import type { RoleDefinition, TeamDefinition, TeamRunResult } from './role.js';
import type { ProjectStore, Project, TeamRun } from '../projects/project-store.js';
import type { IssueStore } from '../projects/issue-store.js';
import { buildProjectContext } from '../projects/project-context-builder.js';
import { exportProjectMarkdown } from '../projects/project-exporter.js';
import type { LeadPlanner } from '../agents/lead-planner.js';
import type { ToolManifest } from '../shared/types.js';

/** Callback to show the manifest to the user and wait for approval */
export type ManifestApprovalRequester = (manifest: ToolManifest) => Promise<boolean>;

export class TeamCoordinator {
  private runtime: AgentRuntime;
  private orchestrator: Orchestrator;
  private roles: Map<string, RoleDefinition>;
  private teams: Map<string, TeamDefinition>;
  private projectStore: ProjectStore | null;
  private issueStore: IssueStore | null;
  private leadPlanner: LeadPlanner | null;
  private requestManifestApproval: ManifestApprovalRequester;

  constructor(opts: {
    runtime: AgentRuntime;
    roles: RoleDefinition[];
    teams: TeamDefinition[];
    projectStore?: ProjectStore;
    issueStore?: IssueStore;
    /** Optional — if omitted, manifest planning is skipped (auto-approved) */
    leadPlanner?: LeadPlanner;
    /** Called with the manifest before team execution; return true to approve */
    requestManifestApproval?: ManifestApprovalRequester;
  }) {
    this.runtime = opts.runtime;
    this.orchestrator = new Orchestrator(opts.runtime);
    this.roles = new Map(opts.roles.map(r => [r.id, r]));
    this.teams = new Map(opts.teams.map(t => [t.id, t]));
    this.projectStore = opts.projectStore ?? null;
    this.issueStore = opts.issueStore ?? null;
    this.leadPlanner = opts.leadPlanner ?? null;
    // Default: auto-approve (backward compat — no UI connected)
    this.requestManifestApproval = opts.requestManifestApproval ?? (async () => true);
  }

  listTeams(): TeamDefinition[] {
    return [...this.teams.values()];
  }

  listRoles(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  findTeamByLead(agentId: string): TeamDefinition | null {
    for (const team of this.teams.values()) {
      if (team.leadAgentId === agentId) return team;
    }
    return null;
  }

  getProjectStore(): ProjectStore | null {
    return this.projectStore;
  }

  // ── Resume ────────────────────────────────────────────────────────────────

  async resume(runId: string): Promise<TeamRunResult> {
    const store = this.projectStore;
    if (!store) throw new Error('ProjectStore not configured — cannot resume runs');

    const run = store.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const team = this.teams.get(run.teamId);
    if (!team) throw new Error(`Team not found: ${run.teamId}`);

    // Idempotent: already done
    if (run.status === 'done') {
      return this.buildResultFromStoredRun(run, store, team);
    }

    const start = Date.now();
    const totalTokens = { input: 0, output: 0, total: 0, cost: 0 };
    const addTokens = (t: { input: number; output: number; total: number; cost: number }) => {
      totalTokens.input  += t.input;
      totalTokens.output += t.output;
      totalTokens.total  += t.total;
      totalTokens.cost   += t.cost;
    };

    store.updateRunStatus(runId, 'running');
    eventBus.emit('team:start', { teamId: run.teamId, teamName: team.name, goal: run.goal });

    const allTasks  = store.listTasksByRun(runId);
    const doneTasks = allTasks.filter(t => t.status === 'done');

    // Reconstruct ALL TaskDefinitions — pass done ones with pre-seeded results
    // so the graph handles dependency resolution correctly
    const taskDefs: TaskDefinition[] = allTasks.map(t => ({
      id: t.taskId,
      agentId: t.agentId,
      prompt: t.status === 'failed'
        ? `NOTE: This task was attempted before and failed. Check existing state before making changes.\n\n${t.prompt}`
        : t.prompt,
      label: t.label,
      depends: JSON.parse(t.dependsJson) as string[],
    }));

    const completedResults = Object.fromEntries(doneTasks.map(t => [t.taskId, t.result ?? '']));

    for (const td of taskDefs) {
      eventBus.emit('task:created', {
        taskId: td.id,
        label: td.label ?? td.id,
        agentId: td.agentId,
        teamId: run.teamId,
        depends: td.depends ?? [],
        phase: 'work',
      });
    }

    const project = run.projectId ? store.getProject(run.projectId) : undefined;

    // Subscribe eventBus for task lifecycle → DB updates
    const unsub = this.subscribeTaskEvents(runId, run.teamId, store);
    try {
      const orchResult = await this.orchestrator.run({
        tasks: taskDefs,
        maxConcurrent: 4,
        failFast: false,
        channelId: run.channelId,
        peerId: run.peerId,
        teamId: run.teamId,
        completedResults,
        onFileWrite: project
          ? (e) => store.upsertArtifact({ projectId: project.id, path: e.relativePath, runId, bytes: e.bytes })
          : undefined,
      });

      const resultLines = orchResult.tasks.map(t => {
        if (t.status === 'done') return `[${t.label ?? t.id}] DONE:\n${t.result}`;
        if (t.status === 'failed') return `[${t.label ?? t.id}] FAILED: ${t.error}`;
        return `[${t.label ?? t.id}] SKIPPED`;
      }).join('\n\n---\n\n');

      const synthesisResult = await this.runtime.run({
        userMessage:
          `You coordinated team "${team.name}" on goal: ${run.goal}\n\n` +
          `Here are the results from your team:\n\n${resultLines}\n\n` +
          `Synthesise these results into a cohesive final answer for the user. ` +
          `Be concise. If there were failures, acknowledge them and explain the impact.`,
        agentId: team.leadAgentId,
        channelId: run.channelId,
        peerId: run.peerId,
      });
      addTokens(synthesisResult.tokensUsed);

      const synthesis = synthesisResult.success
        ? synthesisResult.content
        : `Synthesis failed: ${synthesisResult.error}\n\nRaw results:\n${resultLines}`;

      const finalStatus = orchResult.success ? 'done' : 'failed';
      store.updateRunStatus(runId, finalStatus, synthesis);
      if (project) store.setLastRunId(project.id, runId);

      if (project) {
        void this.generateArtifactSummaries(project.id, team.leadAgentId, store);
        const artifacts = store.listArtifacts(project.id);
        const recentRuns = store.listRunsByProject(project.id, 5);
        void exportProjectMarkdown({ project, artifacts, recentRuns, latestRunTasks: store.listTasksByRun(runId) });
      }

      const failedCount = orchResult.tasks.filter(t => t.status === 'failed').length;
      const doneCount   = doneTasks.length + orchResult.tasks.filter(t => t.status === 'done').length;

      eventBus.emit('team:complete', { teamId: run.teamId, teamName: team.name, success: orchResult.success, durationMs: Date.now() - start });

      return {
        teamId: run.teamId, teamName: team.name, goal: run.goal,
        success: orchResult.success, synthesis,
        taskCount: allTasks.length, doneCount, failedCount,
        totalDurationMs: Date.now() - start, tokensUsed: totalTokens,
        projectId: run.projectId, runId, resumable: failedCount > 0,
      };
    } finally {
      unsub();
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async run(
    teamId: string,
    goal: string,
    opts?: { channelId?: string; peerId?: string; projectId?: string },
  ): Promise<TeamRunResult> {
    const start = Date.now();
    const team = this.teams.get(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);
    const totalTokens = { input: 0, output: 0, total: 0, cost: 0 };
    const addTokens = (t: { input: number; output: number; total: number; cost: number }) => {
      totalTokens.input  += t.input;
      totalTokens.output += t.output;
      totalTokens.total  += t.total;
      totalTokens.cost   += t.cost;
    };

    eventBus.emit('team:start', { teamId, teamName: team.name, goal });

    // ── Resolve project (auto-bind or create) ────────────────────────────
    const { project, isNewProject } = await this.resolveProject(teamId, goal, opts);

    // ── Phase 0: generate project brief for new projects ─────────────────
    if (isNewProject && project && this.projectStore) {
      const briefResult = await this.runtime.run({
        userMessage:
          `Write a concise project brief (3-5 sentences) for this project:\n\n${goal}\n\n` +
          `Include: what is being built, who it's for, and what success looks like. ` +
          `Reply with only the brief text — no headings or markdown.`,
        agentId: team.leadAgentId,
        channelId: `team:${teamId}:_brief`,
        peerId: 'coordinator',
        maxTokens: 512,
      });
      if (briefResult.success && briefResult.content.trim()) {
        this.projectStore.updateBrief(project.id, briefResult.content.trim());
      }
    }

    // ── Synthetic task: decompose ─────────────────────────────────────────
    eventBus.emit('task:created', {
      taskId: `${teamId}:__decompose__`,
      label: 'Decompose goal',
      agentId: team.leadAgentId,
      teamId,
      depends: [],
      phase: 'decompose',
    });
    eventBus.emit('task:started', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId });

    // ── Phase 1: decompose goal into tasks ───────────────────────────────
    const memberContext = team.members.map(m => {
      const role = this.roles.get(m.roleId);
      return `  - Agent "${m.agentId}" with role "${role?.name ?? m.roleId}": ${role?.description ?? '(no description)'}`;
    }).join('\n');

    const sharedGoalNote = team.sharedGoal
      ? `\n\nStanding team context: ${team.sharedGoal}`
      : '';

    // ── Phase 0b: classify request kind (only for existing projects) ─────────
    const isExistingProject = project && !isNewProject;
    let runKind: TeamRun['kind'] = isNewProject ? 'init' : 'feature';
    if (isExistingProject && project) {
      runKind = await this.classifyRequest(goal, team.leadAgentId, teamId);
    }

    // Build project context block (injected when there's an existing project)
    let projectContextBlock = '';
    if (project && !isNewProject && this.projectStore) {
      const artifacts   = this.projectStore.listArtifacts(project.id);
      const recentRuns  = this.projectStore.listRecentRunsByTeam(teamId, 5);
      const openIssues  = this.issueStore?.listOpen(project.id) ?? [];
      projectContextBlock = buildProjectContext(project, artifacts, recentRuns, openIssues) + '\n';
    }

    const classificationNote = isExistingProject && runKind !== 'feature'
      ? `This request was classified as \`${runKind}\`. ` +
        (runKind === 'bugfix'   ? 'Focus on identifying the root cause first, not adding new features. ' : '') +
        (runKind === 'refactor' ? 'Improve code quality without changing external behaviour. '           : '') +
        (runKind === 'question' ? 'Answer the question using existing project knowledge. '               : '') +
        '\n\n'
      : '';

    const decompositionPrompt =
      `You are the lead coordinator of team "${team.name}".${sharedGoalNote}\n\n` +
      (projectContextBlock ? `${projectContextBlock}\n` : '') +
      `Your team members:\n${memberContext}\n\n` +
      `Current request: ${goal}\n\n` +
      classificationNote +
      (isExistingProject
        ? `This is an EXISTING project. Modify existing artifacts when relevant — do NOT recreate them from scratch. ` +
          `Reference specific files listed in "Existing Artifacts" above when assigning tasks.\n\n`
        : '') +
      `If the goal is conversational (a greeting, simple question, or something you can answer directly without team collaboration), reply with an empty JSON array: []\n\n` +
      `Otherwise, break this goal into concrete tasks for your team members. ` +
      `Reply with ONLY a valid JSON array (no markdown fences, no explanation) matching this schema:\n` +
      `[{ "id": "t1", "agentId": "<agentId>", "prompt": "<task prompt>", "label": "<short label>", "depends": [] }]\n` +
      `Use "depends" to express task ordering (array of id strings). ` +
      `Keep prompts self-contained so agents don't need extra context.`;

    const decompositionResult = await this.runtime.run({
      userMessage: decompositionPrompt,
      agentId: team.leadAgentId,
      channelId: `team:${teamId}:_decompose`,
      peerId: 'coordinator',
      maxTokens: 16384,
    });
    addTokens(decompositionResult.tokensUsed);

    const noProjectId = null;
    const noRunId = null;

    if (!decompositionResult.success) {
      const err = `Lead agent failed during decomposition: ${decompositionResult.error}`;
      eventBus.emit('task:failed', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
        error: decompositionResult.error, durationMs: decompositionResult.durationMs });
      eventBus.emit('team:failed', { teamId, error: err });
      return {
        teamId, teamName: team.name, goal, success: false, synthesis: err,
        taskCount: 0, doneCount: 0, failedCount: 0,
        totalDurationMs: Date.now() - start, tokensUsed: totalTokens,
        projectId: project?.id ?? noProjectId, runId: noRunId, resumable: false,
      };
    }

    // Parse the JSON task list
    let tasks: TaskDefinition[];
    try {
      if (!decompositionResult.content.trim()) {
        throw new Error('model returned empty response — agent produced no text content');
      }
      // Strip markdown code fences (handles both \n and \r\n)
      let cleaned = decompositionResult.content.trim()
        .replace(/^```(?:json)?\r?\n?/, '')
        .replace(/\r?\n?```\s*$/, '')
        .trim();
      // If the model added surrounding explanation, try to extract the JSON array
      if (!cleaned.startsWith('[')) {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) cleaned = match[0];
      }
      tasks = JSON.parse(cleaned) as TaskDefinition[];
      if (!Array.isArray(tasks)) throw new Error('decomposition did not return a JSON array');
    } catch (err) {
      const errMsg = `Lead agent returned invalid task JSON: ${(err as Error).message}`;
      eventBus.emit('task:failed', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
        error: errMsg });
      eventBus.emit('team:failed', { teamId, error: errMsg });
      return {
        teamId, teamName: team.name, goal, success: false, synthesis: errMsg,
        taskCount: 0, doneCount: 0, failedCount: 0,
        totalDurationMs: Date.now() - start, tokensUsed: totalTokens,
        projectId: project?.id ?? noProjectId, runId: noRunId, resumable: false,
      };
    }

    eventBus.emit('task:done', { taskId: `${teamId}:__decompose__`, agentId: team.leadAgentId, teamId,
      durationMs: decompositionResult.durationMs });

    // ── Persist run + tasks immediately after decompose ───────────────────
    let persistedRunId: string | null = null;
    if (this.projectStore && tasks.length > 0) {
      const run = this.projectStore.createRun({
        projectId: project?.id ?? null,
        teamId,
        goal,
        kind: runKind,
        channelId: opts?.channelId ?? `team:${teamId}`,
        peerId: opts?.peerId ?? 'user',
      });
      persistedRunId = run.id;
      this.projectStore.bulkInsertTasks(run.id, tasks.map(t => ({
        taskId: t.id,
        label: t.label ?? t.id,
        agentId: t.agentId,
        prompt: t.prompt,
        depends: t.depends ?? [],
      })));
      if (project) this.projectStore.setLastRunId(project.id, run.id);

      // Auto-create issue for bugfix / feature_request runs
      if (project && this.issueStore && (runKind === 'bugfix' || runKind === 'feature')) {
        const issueKind = runKind === 'bugfix' ? 'bug' : 'feature_request';
        this.issueStore.createIssue({
          projectId: project.id,
          kind: issueKind,
          title: goal.slice(0, 120),
          body: goal,
          runId: run.id,
        });
      }
    }

    // Empty task list = lead handles directly (conversational/trivial goal)
    if (tasks.length === 0) {
      const directResult = await this.runtime.run({
        userMessage: goal,
        agentId: team.leadAgentId,
        channelId: opts?.channelId ?? `team:${teamId}:direct`,
        peerId: opts?.peerId ?? 'user',
      });
      addTokens(directResult.tokensUsed);
      const synthesis = directResult.success ? directResult.content : `Error: ${directResult.error}`;
      const directRunResult: TeamRunResult = {
        teamId, teamName: team.name, goal,
        success: directResult.success, synthesis,
        taskCount: 0, doneCount: 0, failedCount: 0,
        totalDurationMs: Date.now() - start, tokensUsed: totalTokens,
        projectId: project?.id ?? noProjectId, runId: persistedRunId, resumable: false,
      };
      eventBus.emit('team:complete', { teamId, teamName: team.name, success: directRunResult.success, durationMs: directRunResult.totalDurationMs });
      return directRunResult;
    }

    // Announce discovered tasks
    for (const task of tasks) {
      eventBus.emit('task:created', {
        taskId: task.id,
        label: task.label ?? task.id,
        agentId: task.agentId,
        teamId,
        depends: task.depends ?? [],
        phase: 'work',
      });
    }

    // Apply role system-prompt prefixes
    tasks = tasks.map(task => {
      const member = team.members.find(m => m.agentId === task.agentId);
      if (!member) return task;
      const role = this.roles.get(member.roleId);
      if (!role?.systemPromptPrefix) return task;
      return { ...task, prompt: `${role.systemPromptPrefix}\n\n${task.prompt}` };
    });

    // ── Phase 1b: pre-flight manifest (optional) ─────────────────────────
    if (this.leadPlanner && tasks.length > 0) {
      const manifest = await this.leadPlanner.planFromTasks({
        goal,
        teamId,
        teamName: team.name,
        tasks,
        preferredModel: undefined,
        taskId: `${teamId}:__manifest__`,
      });

      const approved = await this.requestManifestApproval(manifest);

      if (approved) {
        const { manifestStore } = await import('../tools/manifest-store.js');
        manifestStore.approve(manifest.id, 'user');
      } else {
        const err = 'Team run aborted: manifest rejected by user';
        eventBus.emit('manifest:rejected', { manifestId: manifest.id, teamId, rejectedBy: 'user' });
        eventBus.emit('team:failed', { teamId, error: err });
        return {
          teamId, teamName: team.name, goal, success: false, synthesis: err,
          taskCount: 0, doneCount: 0, failedCount: 0,
          totalDurationMs: Date.now() - start, tokensUsed: totalTokens,
          projectId: project?.id ?? null, runId: persistedRunId, resumable: false,
        };
      }
    }

    // Subscribe eventBus for task lifecycle → DB updates
    const store = this.projectStore;
    const runId = persistedRunId;
    const unsub = (store && runId) ? this.subscribeTaskEvents(runId, teamId, store) : () => {};

    try {
      // ── Phase 2: execute the task graph ──────────────────────────────────
      const orchResult = await this.orchestrator.run({
        tasks,
        maxConcurrent: 4,
        failFast: false,
        channelId: `team:${teamId}`,
        peerId: 'coordinator',
        teamId,
        onFileWrite: (project && store && runId)
          ? (e) => store.upsertArtifact({ projectId: project.id, path: e.relativePath, runId: runId!, bytes: e.bytes })
          : undefined,
      });

      // ── Phase 3: synthesise results ───────────────────────────────────────
      eventBus.emit('task:created', {
        taskId: `${teamId}:__synthesize__`,
        label: 'Synthesise results',
        agentId: team.leadAgentId,
        teamId,
        depends: orchResult.tasks.map(t => t.id),
        phase: 'synthesize',
      });
      eventBus.emit('task:started', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId });

      const resultLines = orchResult.tasks.map(t => {
        if (t.status === 'done') return `[${t.label ?? t.id}] DONE:\n${t.result}`;
        if (t.status === 'failed') return `[${t.label ?? t.id}] FAILED: ${t.error}`;
        return `[${t.label ?? t.id}] SKIPPED`;
      }).join('\n\n---\n\n');

      const synthesisPrompt =
        `You coordinated team "${team.name}" on goal: ${goal}\n\n` +
        `Here are the results from your team:\n\n${resultLines}\n\n` +
        `Synthesise these results into a cohesive final answer for the user. ` +
        `Be concise. If there were failures, acknowledge them and explain the impact.`;

      const synthesisResult = await this.runtime.run({
        userMessage: synthesisPrompt,
        agentId: team.leadAgentId,
        channelId: `team:${teamId}`,
        peerId: 'coordinator',
        onProgress: (event) => {
          eventBus.emit('task:step', {
            taskId: `${teamId}:__synthesize__`,
            agentId: team.leadAgentId,
            teamId,
            step: event.type,
            detail: event.type === 'tool_use' ? (event as { toolName: string }).toolName : undefined,
          });
        },
      });
      addTokens(synthesisResult.tokensUsed);

      if (synthesisResult.success) {
        eventBus.emit('task:done', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId,
          durationMs: synthesisResult.durationMs });
      } else {
        eventBus.emit('task:failed', { taskId: `${teamId}:__synthesize__`, agentId: team.leadAgentId, teamId,
          error: synthesisResult.error, durationMs: synthesisResult.durationMs });
      }

      const synthesis = synthesisResult.success
        ? synthesisResult.content
        : `Synthesis failed: ${synthesisResult.error}\n\nRaw results:\n${resultLines}`;

      // Persist final run status + generate summaries + export
      if (store && runId) {
        const finalStatus = orchResult.success ? 'done' : 'failed';
        store.updateRunStatus(runId, finalStatus, synthesis);
        if (project) {
          // Auto-close issue on success, reopen on failure
          if (this.issueStore && (runKind === 'bugfix' || runKind === 'feature')) {
            const openIssuesForRun = this.issueStore.listOpen(project.id)
              .filter(i => i.openedInRunId === runId);
            for (const issue of openIssuesForRun) {
              if (orchResult.success) {
                this.issueStore.close(issue.id, runId);
              } else {
                this.issueStore.reopen(issue.id);
              }
            }
          }
          void this.generateArtifactSummaries(project.id, team.leadAgentId, store);
          const artifacts  = store.listArtifacts(project.id);
          const recentRuns = store.listRunsByProject(project.id, 5);
          void exportProjectMarkdown({ project, artifacts, recentRuns, latestRunTasks: store.listTasksByRun(runId) });
        }
      }

      const failedCount = orchResult.failedCount;
      const result: TeamRunResult = {
        teamId, teamName: team.name, goal,
        success: orchResult.success, synthesis,
        taskCount: orchResult.taskCount,
        doneCount: orchResult.doneCount,
        failedCount,
        totalDurationMs: Date.now() - start,
        tokensUsed: totalTokens,
        projectId: project?.id ?? noProjectId,
        runId: persistedRunId,
        resumable: failedCount > 0 && persistedRunId !== null,
      };

      eventBus.emit('team:complete', {
        teamId, teamName: team.name,
        success: result.success,
        durationMs: result.totalDurationMs,
      });

      return result;
    } finally {
      unsub();
    }
  }

  // ── Project resolve ───────────────────────────────────────────────────────

  private async resolveProject(
    teamId: string,
    goal: string,
    opts?: { projectId?: string; channelId?: string; peerId?: string },
  ): Promise<{ project: Project | null; isNewProject: boolean }> {
    const store = this.projectStore;
    if (!store) return { project: null, isNewProject: false };

    // Explicit project ID override
    if (opts?.projectId) {
      const p = store.getProject(opts.projectId);
      return { project: p ?? null, isNewProject: false };
    }

    // Auto-bind: find most recently active project for this team
    const existing = store.findActiveByTeam(teamId);
    if (existing) {
      return { project: existing, isNewProject: false };
    }

    // No project yet — create one
    const workspacePath = this.inferWorkspacePath(goal);
    const name = this.inferProjectName(goal);
    const project = store.createProject({ teamId, name, workspacePath });
    return { project, isNewProject: true };
  }

  /** Extracts workspace path from goal text, e.g. "...เก็บไว้ใน folder ai-desk-html" */
  private inferWorkspacePath(goal: string): string {
    const folderMatch =
      goal.match(/(?:folder|directory|dir|เก็บ(?:ไว้)?ใน(?:\s+folder)?)\s+([^\s,."']+)/i) ??
      goal.match(/(?:in|into|to)\s+(?:folder\s+)?([a-zA-Z0-9_\-./]+)/i);
    if (folderMatch?.[1]) {
      const p = folderMatch[1].replace(/[/\\]+$/, '');
      return isAbsolute(p) ? p : resolve(process.cwd(), p);
    }
    // Fallback: use a sanitised slug of the first 5 words
    const slug = goal
      .replace(/[^\w\s-]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join('-')
      .toLowerCase()
      .replace(/-+/g, '-')
      .slice(0, 40);
    return resolve(process.cwd(), slug || 'project');
  }

  private inferProjectName(goal: string): string {
    return goal.trim().slice(0, 80).replace(/\s+/g, ' ');
  }

  // ── EventBus → DB task updates ────────────────────────────────────────────

  private subscribeTaskEvents(
    runId: string,
    teamId: string,
    store: ProjectStore,
  ): () => void {
    type Ev = { event: string; timestamp: number; data: Record<string, unknown> };

    const onStarted = (ev: Ev) => {
      if (ev.data['teamId'] !== teamId) return;
      store.updateTask(runId, String(ev.data['taskId'] ?? ''), { status: 'running', startedAt: Date.now() });
    };
    const onDone = (ev: Ev) => {
      if (ev.data['teamId'] !== teamId) return;
      store.updateTask(runId, String(ev.data['taskId'] ?? ''), {
        status: 'done',
        result: ev.data['result'] != null ? String(ev.data['result']) : undefined,
        finishedAt: Date.now(),
      });
    };
    const onFailed = (ev: Ev) => {
      if (ev.data['teamId'] !== teamId) return;
      store.updateTask(runId, String(ev.data['taskId'] ?? ''), {
        status: 'failed',
        error: ev.data['error'] != null ? String(ev.data['error']) : undefined,
        finishedAt: Date.now(),
      });
    };

    eventBus.on('task:started', onStarted as Parameters<typeof eventBus.on>[1]);
    eventBus.on('task:done',    onDone    as Parameters<typeof eventBus.on>[1]);
    eventBus.on('task:failed',  onFailed  as Parameters<typeof eventBus.on>[1]);

    return () => {
      eventBus.off('task:started', onStarted as Parameters<typeof eventBus.on>[1]);
      eventBus.off('task:done',    onDone    as Parameters<typeof eventBus.on>[1]);
      eventBus.off('task:failed',  onFailed  as Parameters<typeof eventBus.on>[1]);
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Classify a user request — best-effort, falls back to 'feature' on any failure */
  private async classifyRequest(
    goal: string,
    leadAgentId: string,
    teamId: string,
  ): Promise<TeamRun['kind']> {
    const VALID: TeamRun['kind'][] = ['feature', 'bugfix', 'refactor', 'question'];
    try {
      const result = await this.runtime.run({
        userMessage:
          `Classify the following user request into exactly one category.\n` +
          `Reply with ONLY one word from: feature, bugfix, refactor, question\n\n` +
          `Request: ${goal}`,
        agentId: leadAgentId,
        channelId: `team:${teamId}:_classify`,
        peerId: 'coordinator',
        maxTokens: 16,
      });
      if (!result.success) return 'feature';
      const word = result.content.trim().toLowerCase().replace(/[^a-z_]/g, '') as TeamRun['kind'];
      return VALID.includes(word) ? word : 'feature';
    } catch {
      return 'feature';
    }
  }

  /** Generate 1-line summaries for artifacts that have none — best-effort, never throws */
  private async generateArtifactSummaries(
    projectId: string,
    leadAgentId: string,
    store: ProjectStore,
  ): Promise<void> {
    try {
      const unsummarized = store.listArtifactsWithoutSummary(projectId);
      if (unsummarized.length === 0) return;

      const list = unsummarized.map(a => `- ${a.path}`).join('\n');
      const result = await this.runtime.run({
        userMessage:
          `For each file below, write a single-line description (max 10 words) of what it likely contains.\n` +
          `Reply with ONLY a JSON object mapping path → summary, e.g. {"index.html": "Main landing page HTML"}.\n\n` +
          `Files:\n${list}`,
        agentId: leadAgentId,
        channelId: `project:${projectId}:_summarize`,
        peerId: 'coordinator',
        maxTokens: 1024,
      });

      if (!result.success) return;

      let summaries: Record<string, string>;
      try {
        let cleaned = result.content.trim()
          .replace(/^```(?:json)?\r?\n?/, '')
          .replace(/\r?\n?```\s*$/, '')
          .trim();
        summaries = JSON.parse(cleaned) as Record<string, string>;
      } catch { return; }

      for (const [path, summary] of Object.entries(summaries)) {
        if (typeof summary === 'string' && summary.trim()) {
          store.updateArtifactSummary(projectId, path, summary.trim().slice(0, 120));
        }
      }
    } catch { /* best-effort */ }
  }

  private buildResultFromStoredRun(run: TeamRun, store: ProjectStore, team: TeamDefinition): TeamRunResult {
    const tasks = store.listTasksByRun(run.id);
    return {
      teamId: run.teamId,
      teamName: team.name,
      goal: run.goal,
      success: run.status === 'done',
      synthesis: run.synthesis ?? '',
      taskCount: tasks.length,
      doneCount: tasks.filter(t => t.status === 'done').length,
      failedCount: tasks.filter(t => t.status === 'failed').length,
      totalDurationMs: run.finishedAt ? run.finishedAt - run.startedAt : 0,
      tokensUsed: { input: 0, output: 0, total: 0, cost: 0 },
      projectId: run.projectId,
      runId: run.id,
      resumable: false,
    };
  }
}
