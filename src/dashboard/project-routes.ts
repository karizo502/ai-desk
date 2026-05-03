/**
 * AI_DESK - Project dashboard routes
 *
 * All routes require dashboard auth (mounted after checkAuth).
 *
 *   GET  /dashboard/api/projects
 *   GET  /dashboard/api/projects/:id
 *   PUT  /dashboard/api/projects/:id
 *   GET  /dashboard/api/projects/:id/runs
 *   GET  /dashboard/api/projects/:id/artifacts
 *   GET  /dashboard/api/projects/:id/issues
 *   GET  /dashboard/api/runs/:id
 *   POST /dashboard/api/runs/:id/resume
 *   POST /dashboard/api/issues/:id/close
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProjectStore, Project, TeamRun } from '../projects/project-store.js';
import type { IssueStore } from '../projects/issue-store.js';
import type { TeamCoordinator } from '../roles/team-coordinator.js';

export class ProjectRoutes {
  constructor(
    private projectStore: ProjectStore,
    private issueStore: IssueStore | null = null,
    private teamCoordinator: TeamCoordinator | null = null,
  ) {}

  setTeamCoordinator(teamCoordinator: TeamCoordinator | null): void {
    this.teamCoordinator = teamCoordinator;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const parsed = new URL(req.url ?? '', `http://${req.headers.host}`);
    const url = parsed.pathname;
    const method = req.method?.toUpperCase() ?? 'GET';

    if (!url.startsWith('/dashboard/api/projects') &&
        !url.startsWith('/dashboard/api/runs') &&
        !url.startsWith('/dashboard/api/issues')) {
      return false;
    }

    res.setHeader('Content-Type', 'application/json');

    if (url === '/dashboard/api/projects' && method === 'GET') {
      this.listProjects(res, parsed);
      return true;
    }

    const projectMatch = url.match(/^\/dashboard\/api\/projects\/([^/]+)$/);
    if (projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]);
      if (method === 'GET') { this.showProject(res, projectId); return true; }
      if (method === 'PUT') { void this.updateProject(req, res, projectId); return true; }
    }

    const projectChildMatch = url.match(/^\/dashboard\/api\/projects\/([^/]+)\/(runs|artifacts|issues)$/);
    if (projectChildMatch && method === 'GET') {
      const projectId = decodeURIComponent(projectChildMatch[1]);
      const child = projectChildMatch[2];
      if (child === 'runs') this.listRuns(res, projectId, parsed);
      if (child === 'artifacts') this.listArtifacts(res, projectId);
      if (child === 'issues') this.listIssues(res, projectId);
      return true;
    }

    const runMatch = url.match(/^\/dashboard\/api\/runs\/([^/]+)$/);
    if (runMatch && method === 'GET') {
      this.showRun(res, decodeURIComponent(runMatch[1]));
      return true;
    }

    const resumeMatch = url.match(/^\/dashboard\/api\/runs\/([^/]+)\/resume$/);
    if (resumeMatch && method === 'POST') {
      void this.resumeRun(res, decodeURIComponent(resumeMatch[1]));
      return true;
    }

    const issueCloseMatch = url.match(/^\/dashboard\/api\/issues\/([^/]+)\/close$/);
    if (issueCloseMatch && method === 'POST') {
      this.closeIssue(res, decodeURIComponent(issueCloseMatch[1]));
      return true;
    }

    return false;
  }

  private listProjects(res: ServerResponse, parsed: URL): void {
    const teamId = parsed.searchParams.get('team')?.trim();
    const limit = clampInt(parsed.searchParams.get('limit'), 100, 1, 500);
    const projects = teamId
      ? this.projectStore.listByTeam(teamId).slice(0, limit)
      : this.projectStore.listAll(limit);

    this.json(res, {
      projects: projects.map(p => this.enrichProject(p)),
    });
  }

  private showProject(res: ServerResponse, projectId: string): void {
    const project = this.projectStore.getProject(projectId);
    if (!project) { this.error(res, 404, 'Project not found'); return; }
    this.json(res, {
      project: this.enrichProject(project),
      artifacts: this.projectStore.listArtifacts(project.id),
      runs: this.projectStore.listRunsByProject(project.id, 20).map(r => this.enrichRun(r)),
      issues: this.issueStore?.listByProject(project.id) ?? [],
    });
  }

  private async updateProject(req: IncomingMessage, res: ServerResponse, projectId: string): Promise<void> {
    const project = this.projectStore.getProject(projectId);
    if (!project) { this.error(res, 404, 'Project not found'); return; }

    let body: Record<string, unknown>;
    try { body = JSON.parse(await readBody(req)) as Record<string, unknown>; }
    catch { this.error(res, 400, 'Invalid JSON'); return; }

    if (typeof body['name'] === 'string') {
      const name = body['name'].trim();
      if (!name) { this.error(res, 400, 'name cannot be empty'); return; }
      this.projectStore.updateProjectName(projectId, name);
    }
    if (typeof body['brief'] === 'string') {
      this.projectStore.updateBrief(projectId, body['brief']);
    }

    this.json(res, { ok: true, project: this.enrichProject(this.projectStore.getProject(projectId)!) });
  }

  private listRuns(res: ServerResponse, projectId: string, parsed: URL): void {
    if (!this.projectStore.getProject(projectId)) { this.error(res, 404, 'Project not found'); return; }
    const limit = clampInt(parsed.searchParams.get('limit'), 50, 1, 200);
    this.json(res, { runs: this.projectStore.listRunsByProject(projectId, limit).map(r => this.enrichRun(r)) });
  }

  private listArtifacts(res: ServerResponse, projectId: string): void {
    if (!this.projectStore.getProject(projectId)) { this.error(res, 404, 'Project not found'); return; }
    this.json(res, { artifacts: this.projectStore.listArtifacts(projectId) });
  }

  private listIssues(res: ServerResponse, projectId: string): void {
    if (!this.projectStore.getProject(projectId)) { this.error(res, 404, 'Project not found'); return; }
    this.json(res, { issues: this.issueStore?.listByProject(projectId) ?? [] });
  }

  private showRun(res: ServerResponse, runId: string): void {
    const run = this.projectStore.getRun(runId);
    if (!run) { this.error(res, 404, 'Run not found'); return; }
    this.json(res, {
      run: this.enrichRun(run),
      tasks: this.projectStore.listTasksByRun(runId).map(t => ({
        ...t,
        depends: safeJsonArray(t.dependsJson),
      })),
    });
  }

  private async resumeRun(res: ServerResponse, runId: string): Promise<void> {
    const run = this.projectStore.getRun(runId);
    if (!run) { this.error(res, 404, 'Run not found'); return; }
    if (!this.teamCoordinator) { this.error(res, 503, 'Team coordinator not available'); return; }

    try {
      const result = await this.teamCoordinator.resume(runId);
      this.json(res, { ok: true, result });
    } catch (err) {
      this.error(res, 500, (err as Error).message ?? 'Resume failed');
    }
  }

  private closeIssue(res: ServerResponse, issueId: string): void {
    if (!this.issueStore) { this.error(res, 503, 'Issue tracking not available'); return; }
    const issue = this.issueStore.getIssue(issueId);
    if (!issue) { this.error(res, 404, 'Issue not found'); return; }
    this.issueStore.close(issueId);
    this.json(res, { ok: true, issue: this.issueStore.getIssue(issueId) });
  }

  private enrichProject(project: Project): Project & {
    runCount: number;
    artifactCount: number;
    openIssueCount: number;
    lastRun: ReturnType<ProjectRoutes['enrichRun']> | null;
  } {
    const runs = this.projectStore.listRunsByProject(project.id, 1000);
    const artifacts = this.projectStore.listArtifacts(project.id);
    const openIssues = this.issueStore?.listOpen(project.id) ?? [];
    const lastRun = runs[0] ? this.enrichRun(runs[0]) : null;
    return {
      ...project,
      runCount: runs.length,
      artifactCount: artifacts.length,
      openIssueCount: openIssues.length,
      lastRun,
    };
  }

  private enrichRun(run: TeamRun): TeamRun & {
    durationMs: number | null;
    taskCounts: Record<string, number>;
    resumable: boolean;
  } {
    const tasks = this.projectStore.listTasksByRun(run.id);
    const taskCounts: Record<string, number> = {};
    for (const t of tasks) taskCounts[t.status] = (taskCounts[t.status] ?? 0) + 1;
    return {
      ...run,
      durationMs: run.finishedAt ? run.finishedAt - run.startedAt : null,
      taskCounts,
      resumable: run.status === 'failed' || run.status === 'paused',
    };
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }

  private error(res: ServerResponse, status: number, message: string): void {
    this.json(res, { error: message }, status);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
