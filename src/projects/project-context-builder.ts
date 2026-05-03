/**
 * AI_DESK — Project Context Builder
 *
 * Formats project state into a structured string for injection
 * into the lead agent's decompose prompt.
 */
import type { Project, ProjectArtifact, TeamRun } from './project-store.js';
import type { ProjectIssue } from './issue-store.js';

export function buildProjectContext(
  project: Project,
  artifacts: ProjectArtifact[],
  recentRuns: TeamRun[],
  openIssues?: ProjectIssue[],
): string {
  const lines: string[] = [];

  lines.push(`## Active Project: ${project.name}`);
  lines.push(`Workspace: ${project.workspacePath}`);
  lines.push(`Project ID: ${project.id}`);
  lines.push('');

  if (project.brief) {
    lines.push('### Project Brief');
    lines.push(project.brief);
    lines.push('');
  }

  if (artifacts.length > 0) {
    lines.push(`### Existing Artifacts (${artifacts.length})`);
    for (const a of artifacts) {
      const size = a.bytes > 0 ? ` (${formatBytes(a.bytes)})` : '';
      const summary = a.summary ? ` — ${a.summary}` : '';
      lines.push(`- ${a.path}${size}${summary}`);
    }
    lines.push('');
  }

  if (recentRuns.length > 0) {
    lines.push('### Recent Runs (last 5)');
    for (const run of recentRuns) {
      const icon = run.status === 'done' ? '✓' : run.status === 'failed' ? '✗' : '…';
      const age = formatAge(run.startedAt);
      lines.push(`- [${icon}] ${run.kind}: ${run.goal.slice(0, 80)}${run.goal.length > 80 ? '…' : ''} (${age})`);
    }
    lines.push('');
  }

  if (openIssues && openIssues.length > 0) {
    lines.push(`### Open Issues (${openIssues.length})`);
    for (const issue of openIssues) {
      const kindTag = issue.kind === 'bug' ? '🐛' : issue.kind === 'feature_request' ? '✨' : '❓';
      lines.push(`- [${issue.id}] ${kindTag} ${issue.title}`);
      if (issue.body) lines.push(`  ${issue.body.slice(0, 100)}${issue.body.length > 100 ? '…' : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatAge(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
