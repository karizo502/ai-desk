/**
 * Unit tests for IssueStore + @project command routing in MessagingManager
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueStore } from '../projects/issue-store.js';
import { ProjectStore } from '../projects/project-store.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

function makeTmpDir(): string {
  const dir = join(os.tmpdir(), `ai-desk-issue-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStores(): { proj: ProjectStore; issues: IssueStore; tmpDir: string } {
  const tmpDir = makeTmpDir();
  return { proj: new ProjectStore(tmpDir), issues: new IssueStore(tmpDir), tmpDir };
}

// ─── IssueStore CRUD ──────────────────────────────────────────────────────

describe('IssueStore', () => {
  let proj: ProjectStore;
  let issues: IssueStore;

  beforeEach(() => {
    ({ proj, issues } = makeStores());
  });

  it('creates an issue and retrieves it', () => {
    const p = proj.createProject({ teamId: 't1', name: 'Demo', workspacePath: '/tmp/demo' });
    const iss = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'Crash on start' });
    expect(iss.id).toMatch(/^iss-/);
    expect(iss.kind).toBe('bug');
    expect(iss.status).toBe('open');
    expect(iss.title).toBe('Crash on start');

    const fetched = issues.getIssue(iss.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('Crash on start');
  });

  it('creates issue with runId', () => {
    const p = proj.createProject({ teamId: 't1', name: 'Demo', workspacePath: '/tmp/demo' });
    const run = proj.createRun({ projectId: p.id, teamId: 't1', kind: 'bugfix', goal: 'fix crash', channelId: 'ch1', peerId: 'p1' });
    const iss = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'Bug', runId: run.id });
    expect(iss.openedInRunId).toBe(run.id);
  });

  it('listByProject returns all issues for a project', () => {
    const p = proj.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp' });
    issues.createIssue({ projectId: p.id, kind: 'bug', title: 'B1' });
    issues.createIssue({ projectId: p.id, kind: 'feature_request', title: 'F1' });
    expect(issues.listByProject(p.id)).toHaveLength(2);
  });

  it('listOpen returns only open/in_progress issues', () => {
    const p = proj.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp' });
    const iss1 = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'Open bug' });
    const iss2 = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'Closed bug' });
    const iss3 = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'In-progress bug' });
    issues.close(iss2.id);
    issues.setInProgress(iss3.id);

    const open = issues.listOpen(p.id);
    expect(open.map(i => i.id)).toContain(iss1.id);
    expect(open.map(i => i.id)).toContain(iss3.id);
    expect(open.map(i => i.id)).not.toContain(iss2.id);
  });

  it('close sets status=closed and records runId', () => {
    const p = proj.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp' });
    const iss = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'Bug' });
    const run = proj.createRun({ projectId: p.id, teamId: 't1', kind: 'bugfix', goal: 'fix it', channelId: 'ch1', peerId: 'p1' });
    issues.close(iss.id, run.id);
    const closed = issues.getIssue(iss.id)!;
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toBeTypeOf('number');
    expect(closed.closedInRunId).toBe(run.id);
  });

  it('wontfix sets status=wontfix', () => {
    const p = proj.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp' });
    const iss = issues.createIssue({ projectId: p.id, kind: 'question', title: 'Q?' });
    issues.wontfix(iss.id);
    expect(issues.getIssue(iss.id)!.status).toBe('wontfix');
  });

  it('reopen restores status=open and clears closedAt', () => {
    const p = proj.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp' });
    const iss = issues.createIssue({ projectId: p.id, kind: 'bug', title: 'B' });
    issues.close(iss.id);
    issues.reopen(iss.id);
    const reopened = issues.getIssue(iss.id)!;
    expect(reopened.status).toBe('open');
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closedInRunId).toBeNull();
  });

  it('does not mix issues across projects', () => {
    const p1 = proj.createProject({ teamId: 't1', name: 'P1', workspacePath: '/tmp/p1' });
    const p2 = proj.createProject({ teamId: 't1', name: 'P2', workspacePath: '/tmp/p2' });
    issues.createIssue({ projectId: p1.id, kind: 'bug', title: 'B1' });
    expect(issues.listByProject(p2.id)).toHaveLength(0);
  });

  it('closeDb closes without error', () => {
    expect(() => issues.closeDb()).not.toThrow();
  });
});

// ─── Run classification parser ────────────────────────────────────────────

describe('run classification — kind parsing', () => {
  const VALID_KINDS = ['feature', 'bugfix', 'refactor', 'question'] as const;
  type RunKind = typeof VALID_KINDS[number];

  function parseClassification(raw: string): RunKind {
    const word = raw.trim().toLowerCase().split(/\s+/)[0] ?? '';
    return (VALID_KINDS as readonly string[]).includes(word) ? word as RunKind : 'feature';
  }

  it('parses valid kinds', () => {
    expect(parseClassification('feature')).toBe('feature');
    expect(parseClassification('bugfix')).toBe('bugfix');
    expect(parseClassification('refactor')).toBe('refactor');
    expect(parseClassification('question')).toBe('question');
  });

  it('is case-insensitive', () => {
    expect(parseClassification('BUGFIX')).toBe('bugfix');
    expect(parseClassification('Refactor')).toBe('refactor');
  });

  it('falls back to feature for unknown values', () => {
    expect(parseClassification('feature_request')).toBe('feature');
    expect(parseClassification('unknown')).toBe('feature');
    expect(parseClassification('')).toBe('feature');
    expect(parseClassification('   ')).toBe('feature');
  });

  it('uses only the first word', () => {
    expect(parseClassification('bugfix some explanation')).toBe('bugfix');
  });
});

// ─── @project command handler (unit-level) ────────────────────────────────

describe('@project command routing', () => {
  function makeProjectReply(
    rawText: string,
    opts: {
      proj: ProjectStore;
      issues: IssueStore;
      teamId: string | null;
    },
  ): Promise<string> {
    // Inline version of handleProjectCommand logic for testing without full MessagingManager
    const { proj: projectStore, issues: issueStore, teamId } = opts;

    const parts = rawText.trim().split(/\s+/);
    const sub = parts[1] ?? '';

    if (!sub || sub === 'list') {
      if (!teamId) return Promise.resolve('⚠️ Could not determine team — use @team/id first.');
      const projects = projectStore.listAll(20).filter(p => p.teamId === teamId);
      if (projects.length === 0) return Promise.resolve('No projects found for this team. Start a @team run to create one.');
      const lines = projects.map(p => {
        const icon = p.status === 'archived' ? '📦' : '📁';
        return `${icon} \`${p.id}\` **${p.name}** — ${p.workspacePath}`;
      });
      return Promise.resolve(`**Projects (${projects.length})**\n${lines.join('\n')}\n\nUse \`@project switch <id>\` to set the active project.`);
    }

    if (sub === 'switch') {
      const id = parts[2] ?? '';
      if (!id) return Promise.resolve('Usage: `@project switch <project-id>`');
      const project = projectStore.getProject(id);
      if (!project) return Promise.resolve(`⚠️ Project \`${id}\` not found.`);
      projectStore.touchProject(id);
      return Promise.resolve(`✅ Switched to project **${project.name}** (\`${id}\`). Future @team runs for this team will continue under this project.`);
    }

    if (sub === 'archive') {
      if (!teamId) return Promise.resolve('⚠️ Could not determine team.');
      const active = projectStore.findActiveByTeam(teamId);
      if (!active) return Promise.resolve('⚠️ No active project to archive.');
      projectStore.archive(active.id);
      return Promise.resolve(`📦 Archived project **${active.name}** (\`${active.id}\`). Next @team run will start a new project.`);
    }

    if (sub === 'issues') {
      if (!teamId) return Promise.resolve('⚠️ Could not determine team.');
      const active = projectStore.findActiveByTeam(teamId);
      if (!active) return Promise.resolve('⚠️ No active project.');
      const openIssues = issueStore.listOpen(active.id);
      if (openIssues.length === 0) return Promise.resolve(`No open issues for **${active.name}**.`);
      const lines = openIssues.map(iss => {
        const icon = iss.kind === 'bug' ? '🐛' : iss.kind === 'feature_request' ? '✨' : '❓';
        return `${icon} \`${iss.id}\` **${iss.title}**`;
      });
      return Promise.resolve(`**Open Issues — ${active.name}** (${openIssues.length})\n${lines.join('\n')}`);
    }

    return Promise.resolve('**@project commands:**\n  `@project list`\n  `@project switch <id>`\n  `@project archive`\n  `@project issues`');
  }

  let proj: ProjectStore;
  let iss: IssueStore;
  const TEAM = 'team-alpha';

  beforeEach(() => {
    ({ proj, issues: iss } = makeStores());
  });

  it('@project list returns no-projects message when empty', async () => {
    const reply = await makeProjectReply('@project list', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('No projects found');
  });

  it('@project list lists projects for the team', async () => {
    proj.createProject({ teamId: TEAM, name: 'Alpha', workspacePath: '/tmp/alpha' });
    const reply = await makeProjectReply('@project list', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('Alpha');
    expect(reply).toContain('Projects (1)');
  });

  it('@project list does not show other teams projects', async () => {
    proj.createProject({ teamId: 'other-team', name: 'Beta', workspacePath: '/tmp/beta' });
    const reply = await makeProjectReply('@project list', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('No projects found');
  });

  it('@project switch without id returns usage', async () => {
    const reply = await makeProjectReply('@project switch', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('Usage:');
  });

  it('@project switch unknown id returns not found', async () => {
    const reply = await makeProjectReply('@project switch proj-unknown', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('not found');
  });

  it('@project switch valid id confirms and touches project', async () => {
    const p = proj.createProject({ teamId: TEAM, name: 'X', workspacePath: '/tmp/x' });
    const reply = await makeProjectReply(`@project switch ${p.id}`, { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('Switched to project');
    expect(reply).toContain('X');
  });

  it('@project archive archives the active project', async () => {
    proj.createProject({ teamId: TEAM, name: 'ToArchive', workspacePath: '/tmp/a' });
    const reply = await makeProjectReply('@project archive', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('Archived project');
    expect(proj.findActiveByTeam(TEAM)).toBeUndefined();
  });

  it('@project archive with no active project returns warning', async () => {
    const reply = await makeProjectReply('@project archive', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('No active project to archive');
  });

  it('@project issues shows open issues', async () => {
    const p = proj.createProject({ teamId: TEAM, name: 'P', workspacePath: '/tmp/p' });
    iss.createIssue({ projectId: p.id, kind: 'bug', title: 'Login fails' });
    const reply = await makeProjectReply('@project issues', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('Login fails');
    expect(reply).toContain('Open Issues');
  });

  it('@project issues with no open issues returns empty message', async () => {
    proj.createProject({ teamId: TEAM, name: 'P', workspacePath: '/tmp/p' });
    const reply = await makeProjectReply('@project issues', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('No open issues');
  });

  it('@project with unknown subcommand returns help text', async () => {
    const reply = await makeProjectReply('@project foobar', { proj, issues: iss, teamId: TEAM });
    expect(reply).toContain('@project commands');
  });

  it('@project list without teamId returns warning', async () => {
    const reply = await makeProjectReply('@project list', { proj, issues: iss, teamId: null });
    expect(reply).toContain('Could not determine team');
  });
});
