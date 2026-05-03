/**
 * Unit tests for ProjectStore + snapshot diff utilities
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectStore } from '../projects/project-store.js';
import { snapshotDir, diffSnapshots } from '../agents/tool-registry.js';

// Override Database path to use :memory: by monkey-patching the store
// We pass a special sentinel dataDir that maps to :memory:
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

class InMemoryProjectStore extends ProjectStore {
  constructor() {
    // Pass a fake dataDir — we override the db below
    super(':memory-test:');
  }
}

// Actually, let's subclass and inject :memory: directly via a factory
function makeStore(): ProjectStore {
  // Patch: intercept the Database call inside ProjectStore by using a tmp approach
  // Instead, directly test via the public API with a real temp dir
  const os = require('node:os') as typeof import('node:os');
  const tmpDir = join(os.tmpdir(), `ai-desk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  return new ProjectStore(tmpDir);
}

describe('ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(() => {
    store = makeStore();
  });

  // ── Project CRUD ──────────────────────────────────────────────────────────

  it('creates a project and retrieves it by id', () => {
    const p = store.createProject({
      teamId: 'team1',
      name: 'Test Project',
      workspacePath: '/tmp/test',
      brief: 'A test project',
    });

    expect(p.id).toMatch(/^proj-/);
    expect(p.teamId).toBe('team1');
    expect(p.name).toBe('Test Project');
    expect(p.workspacePath).toBe('/tmp/test');
    expect(p.brief).toBe('A test project');
    expect(p.status).toBe('active');

    const loaded = store.getProject(p.id);
    expect(loaded).toEqual(p);
  });

  it('findActiveByTeam returns most recently updated project', () => {
    const p1 = store.createProject({ teamId: 'team1', name: 'P1', workspacePath: '/tmp/p1' });
    const p2 = store.createProject({ teamId: 'team1', name: 'P2', workspacePath: '/tmp/p2' });

    // p2 is the most recently created → should be returned
    const found = store.findActiveByTeam('team1');
    expect(found?.id).toBe(p2.id);

    // Update p1's lastRunId → its updated_at changes
    store.setLastRunId(p1.id, 'run-xyz');
    const found2 = store.findActiveByTeam('team1');
    expect(found2?.id).toBe(p1.id);
  });

  it('findActiveByTeam returns undefined after archive', () => {
    const p = store.createProject({ teamId: 'team1', name: 'P', workspacePath: '/tmp/p' });
    store.archive(p.id);
    expect(store.findActiveByTeam('team1')).toBeUndefined();
  });

  it('updateBrief persists the brief', () => {
    const p = store.createProject({ teamId: 'team1', name: 'P', workspacePath: '/tmp/p' });
    store.updateBrief(p.id, 'Updated brief');
    expect(store.getProject(p.id)?.brief).toBe('Updated brief');
  });

  it('listByTeam returns projects sorted by updated_at desc', () => {
    store.createProject({ teamId: 'team2', name: 'A', workspacePath: '/tmp/a' });
    store.createProject({ teamId: 'team2', name: 'B', workspacePath: '/tmp/b' });
    store.createProject({ teamId: 'team2', name: 'C', workspacePath: '/tmp/c' });

    const list = store.listByTeam('team2');
    expect(list).toHaveLength(3);
    // Most recent first
    expect(list[0].name).toBe('C');
  });

  // ── Artifact CRUD ──────────────────────────────────────────────────────────

  it('upsertArtifact creates and updates correctly', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });

    store.upsertArtifact({ projectId: p.id, path: 'index.html', runId: 'run-1', bytes: 500, summary: 'Main page' });
    const artifacts = store.listArtifacts(p.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('index.html');
    expect(artifacts[0].bytes).toBe(500);
    expect(artifacts[0].summary).toBe('Main page');
    expect(artifacts[0].createdInRunId).toBe('run-1');
    expect(artifacts[0].lastModifiedInRunId).toBe('run-1');

    // Update same path with new run
    store.upsertArtifact({ projectId: p.id, path: 'index.html', runId: 'run-2', bytes: 700 });
    const updated = store.listArtifacts(p.id);
    expect(updated).toHaveLength(1);
    expect(updated[0].bytes).toBe(700);
    expect(updated[0].lastModifiedInRunId).toBe('run-2');
    // createdInRunId should remain run-1
    expect(updated[0].createdInRunId).toBe('run-1');
    // summary should not be overwritten when new summary is empty
    expect(updated[0].summary).toBe('Main page');
  });

  it('upsertArtifact overwrites summary when provided', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });
    store.upsertArtifact({ projectId: p.id, path: 'style.css', runId: 'run-1', bytes: 200, summary: 'Original' });
    store.upsertArtifact({ projectId: p.id, path: 'style.css', runId: 'run-2', bytes: 250, summary: 'Updated summary' });
    expect(store.getArtifact(p.id, 'style.css')?.summary).toBe('Updated summary');
  });

  // ── Run CRUD ──────────────────────────────────────────────────────────────

  it('creates a run and updates status', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });
    const run = store.createRun({
      projectId: p.id,
      teamId: 't1',
      goal: 'Build homepage',
      kind: 'init',
      channelId: 'ch1',
      peerId: 'user',
    });

    expect(run.id).toMatch(/^run-/);
    expect(run.status).toBe('running');
    expect(run.projectId).toBe(p.id);

    store.updateRunStatus(run.id, 'done', 'All done!');
    const updated = store.getRun(run.id);
    expect(updated?.status).toBe('done');
    expect(updated?.synthesis).toBe('All done!');
    expect(updated?.finishedAt).toBeGreaterThan(0);
  });

  it('creates a run with null projectId (ad-hoc)', () => {
    const run = store.createRun({
      projectId: null,
      teamId: 't1',
      goal: 'Quick question',
      kind: 'question',
      channelId: 'ch2',
      peerId: 'user',
    });
    expect(run.projectId).toBeNull();
  });

  it('listRunsByProject returns runs in desc order', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });
    store.createRun({ projectId: p.id, teamId: 't1', goal: 'Run 1', kind: 'init', channelId: 'c', peerId: 'u' });
    store.createRun({ projectId: p.id, teamId: 't1', goal: 'Run 2', kind: 'feature', channelId: 'c', peerId: 'u' });
    const runs = store.listRunsByProject(p.id);
    expect(runs).toHaveLength(2);
    expect(runs[0].goal).toBe('Run 2'); // most recent first
  });

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  it('bulkInsertTasks and updateTask work correctly', () => {
    const run = store.createRun({
      projectId: null, teamId: 't1', goal: 'G', kind: 'feature', channelId: 'c', peerId: 'u',
    });

    store.bulkInsertTasks(run.id, [
      { taskId: 't1', label: 'Task 1', agentId: 'agent-a', prompt: 'Do A', depends: [] },
      { taskId: 't2', label: 'Task 2', agentId: 'agent-b', prompt: 'Do B', depends: ['t1'] },
    ]);

    const tasks = store.listTasksByRun(run.id);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].taskId).toBe('t1');
    expect(tasks[0].status).toBe('pending');
    expect(JSON.parse(tasks[1].dependsJson)).toEqual(['t1']);

    // Mark t1 done
    store.updateTask(run.id, 't1', { status: 'done', result: 'Result A', finishedAt: Date.now() });
    const updated = store.listTasksByRun(run.id);
    expect(updated[0].status).toBe('done');
    expect(updated[0].result).toBe('Result A');
  });

  it('resume scenario: done tasks are not overwritten by bulkInsert', () => {
    const run = store.createRun({
      projectId: null, teamId: 't1', goal: 'G', kind: 'feature', channelId: 'c', peerId: 'u',
    });

    store.bulkInsertTasks(run.id, [
      { taskId: 't1', label: 'T1', agentId: 'a', prompt: 'Do A', depends: [] },
    ]);
    store.updateTask(run.id, 't1', { status: 'done', result: 'Done result' });

    // Calling bulkInsert again (OR IGNORE) should not overwrite
    store.bulkInsertTasks(run.id, [
      { taskId: 't1', label: 'T1', agentId: 'a', prompt: 'Do A', depends: [] },
    ]);
    const tasks = store.listTasksByRun(run.id);
    expect(tasks[0].status).toBe('done'); // not reset to pending
    expect(tasks[0].result).toBe('Done result');
  });

  // ── Task result persistence (Sprint 2) ───────────────────────────────────

  it('updateTask stores result text and is retrievable via listTasksByRun', () => {
    const run = store.createRun({
      projectId: null, teamId: 't1', goal: 'G', kind: 'feature', channelId: 'c', peerId: 'u',
    });
    store.bulkInsertTasks(run.id, [
      { taskId: 'task1', label: 'Build page', agentId: 'a1', prompt: 'Create index.html', depends: [] },
    ]);

    store.updateTask(run.id, 'task1', {
      status: 'done',
      result: 'Created index.html with 200 lines of HTML',
      finishedAt: Date.now(),
    });

    const tasks = store.listTasksByRun(run.id);
    expect(tasks[0].result).toBe('Created index.html with 200 lines of HTML');
    expect(tasks[0].status).toBe('done');
  });

  it('resume uses completedResults from stored done tasks', () => {
    const run = store.createRun({
      projectId: null, teamId: 't1', goal: 'Multi-step', kind: 'feature', channelId: 'c', peerId: 'u',
    });
    store.bulkInsertTasks(run.id, [
      { taskId: 'a', label: 'Step A', agentId: 'ag', prompt: 'Do A', depends: [] },
      { taskId: 'b', label: 'Step B', agentId: 'ag', prompt: 'Do B using {{results.a}}', depends: ['a'] },
    ]);

    // Simulate step A completed before crash
    store.updateTask(run.id, 'a', { status: 'done', result: 'A result', finishedAt: Date.now() });

    // On resume, step A is done — verify completedResults can be built
    const allTasks = store.listTasksByRun(run.id);
    const done = allTasks.filter(t => t.status === 'done');
    const completedResults = Object.fromEntries(done.map(t => [t.taskId, t.result ?? '']));

    expect(completedResults['a']).toBe('A result');
    expect(Object.keys(completedResults)).not.toContain('b'); // b not done yet
  });

  // ── Artifact summary methods (Sprint 2) ──────────────────────────────────

  it('listArtifactsWithoutSummary returns only unsummarized artifacts', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });
    store.upsertArtifact({ projectId: p.id, path: 'a.html', runId: 'r1', bytes: 100, summary: 'Has summary' });
    store.upsertArtifact({ projectId: p.id, path: 'b.js',   runId: 'r1', bytes: 50 });
    store.upsertArtifact({ projectId: p.id, path: 'c.css',  runId: 'r1', bytes: 30, summary: '' });

    const unsummarized = store.listArtifactsWithoutSummary(p.id);
    expect(unsummarized.map(a => a.path)).toEqual(['b.js', 'c.css']);
  });

  it('updateArtifactSummary sets summary correctly', () => {
    const p = store.createProject({ teamId: 't1', name: 'P', workspacePath: '/tmp/p' });
    store.upsertArtifact({ projectId: p.id, path: 'index.html', runId: 'r1', bytes: 200 });

    store.updateArtifactSummary(p.id, 'index.html', 'Main promotional landing page');
    expect(store.getArtifact(p.id, 'index.html')?.summary).toBe('Main promotional landing page');
  });

  // ── listAll ───────────────────────────────────────────────────────────────

  it('listAll returns all projects across teams', () => {
    store.createProject({ teamId: 'team-a', name: 'A1', workspacePath: '/tmp/a1' });
    store.createProject({ teamId: 'team-a', name: 'A2', workspacePath: '/tmp/a2' });
    store.createProject({ teamId: 'team-b', name: 'B1', workspacePath: '/tmp/b1' });

    const all = store.listAll();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const names = all.map(p => p.name);
    expect(names).toContain('A1');
    expect(names).toContain('B1');
  });
});

// ── Snapshot diff utilities ───────────────────────────────────────────────

describe('snapshotDir + diffSnapshots', () => {
  it('diffSnapshots detects new files', () => {
    const before = new Map([
      ['/ws/a.txt', 1000],
      ['/ws/b.txt', 2000],
    ]);
    const after = new Map([
      ['/ws/a.txt', 1000],  // unchanged
      ['/ws/b.txt', 2001],  // modified
      ['/ws/c.txt', 3000],  // new
    ]);

    const changed = diffSnapshots(before, after);
    expect(changed).toContain('/ws/b.txt');
    expect(changed).toContain('/ws/c.txt');
    expect(changed).not.toContain('/ws/a.txt');
  });

  it('diffSnapshots returns empty when nothing changed', () => {
    const snap = new Map([['/ws/a.txt', 1000], ['/ws/b.txt', 2000]]);
    expect(diffSnapshots(snap, new Map(snap))).toHaveLength(0);
  });

  it('diffSnapshots detects all files as new when before is empty', () => {
    const after = new Map([['/ws/a.txt', 1000], ['/ws/b.txt', 2000]]);
    const changed = diffSnapshots(new Map(), after);
    expect(changed).toHaveLength(2);
  });

  it('snapshotDir captures real files in a temp directory', async () => {
    const os = require('node:os') as typeof import('node:os');
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');

    const tmpDir = join(os.tmpdir(), `snap-test-${Date.now()}`);
    mkdirSync(tmpDir);
    writeFileSync(join(tmpDir, 'hello.txt'), 'hello');
    writeFileSync(join(tmpDir, 'world.txt'), 'world');

    const snap = await snapshotDir(tmpDir);
    const keys = [...snap.keys()].map(k => k.replace(/\\/g, '/'));
    expect(keys.some(k => k.endsWith('hello.txt'))).toBe(true);
    expect(keys.some(k => k.endsWith('world.txt'))).toBe(true);
  });
});
