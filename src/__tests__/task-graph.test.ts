import { describe, it, expect } from 'vitest';
import { TaskGraph } from '../orchestration/task-graph.js';

describe('TaskGraph', () => {
  // ── Construction ──────────────────────────────────────────

  it('accepts a valid linear chain', () => {
    expect(() => new TaskGraph([
      { id: 't1', agentId: 'a', prompt: 'step 1' },
      { id: 't2', agentId: 'a', prompt: 'step 2', depends: ['t1'] },
    ])).not.toThrow();
  });

  it('detects a direct cycle', () => {
    expect(() => new TaskGraph([
      { id: 't1', agentId: 'a', prompt: 'x', depends: ['t2'] },
      { id: 't2', agentId: 'a', prompt: 'y', depends: ['t1'] },
    ])).toThrow(/cycle/i);
  });

  it('detects an indirect cycle', () => {
    expect(() => new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '', depends: ['c'] },
      { id: 'b', agentId: 'x', prompt: '', depends: ['a'] },
      { id: 'c', agentId: 'x', prompt: '', depends: ['b'] },
    ])).toThrow(/cycle/i);
  });

  it('rejects a dependency on an unknown task', () => {
    expect(() => new TaskGraph([
      { id: 't1', agentId: 'a', prompt: '', depends: ['ghost'] },
    ])).toThrow(/unknown task/i);
  });

  // ── readyTasks ────────────────────────────────────────────

  it('returns all root tasks as ready initially', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: '' },
      { id: 'c', agentId: 'x', prompt: '', depends: ['a'] },
    ]);
    const ready = g.readyTasks().map(n => n.def.id).sort();
    expect(ready).toEqual(['a', 'b']);
  });

  it('unblocks a dependent task after its dependency completes', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: '', depends: ['a'] },
    ]);
    g.markRunning('a');
    g.markDone('a', 'result-a');
    const ready = g.readyTasks().map(n => n.def.id);
    expect(ready).toContain('b');
  });

  it('does not surface already-running tasks as ready', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: '' },
    ]);
    g.markRunning('a');
    const ready = g.readyTasks().map(n => n.def.id);
    expect(ready).not.toContain('a');
    expect(ready).toContain('b');
  });

  // ── isComplete / hasFailed ────────────────────────────────

  it('is not complete while tasks remain pending', () => {
    const g = new TaskGraph([{ id: 'a', agentId: 'x', prompt: '' }]);
    expect(g.isComplete()).toBe(false);
  });

  it('is complete when all tasks finish', () => {
    const g = new TaskGraph([{ id: 'a', agentId: 'x', prompt: '' }]);
    g.markRunning('a');
    g.markDone('a', 'ok');
    expect(g.isComplete()).toBe(true);
  });

  it('hasFailed returns true after a task fails', () => {
    const g = new TaskGraph([{ id: 'a', agentId: 'x', prompt: '' }]);
    g.markRunning('a');
    g.markFailed('a', 'oops');
    expect(g.hasFailed()).toBe(true);
  });

  // ── Cascade skip ──────────────────────────────────────────

  it('cascade-skips dependents of a failed task', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: '', depends: ['a'] },
      { id: 'c', agentId: 'x', prompt: '', depends: ['b'] },
    ]);
    g.markRunning('a');
    g.markFailed('a', 'error');
    const nodes = g.allNodes();
    expect(nodes.get('b')?.status).toBe('skipped');
    expect(nodes.get('c')?.status).toBe('skipped');
    expect(g.isComplete()).toBe(true);
  });

  it('does not skip tasks with an independent dependency graph', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: '' }, // no dependency on a
    ]);
    g.markRunning('a');
    g.markFailed('a', 'error');
    expect(g.allNodes().get('b')?.status).toBe('pending');
  });

  // ── resolvePrompt ─────────────────────────────────────────

  it('substitutes {{results.<id>}} with the completed result', () => {
    const g = new TaskGraph([
      { id: 'src', agentId: 'x', prompt: 'compute' },
      { id: 'use', agentId: 'x', prompt: 'use this: {{results.src}}', depends: ['src'] },
    ]);
    g.markRunning('src');
    g.markDone('src', 'the-answer');
    const resolved = g.resolvePrompt('use');
    expect(resolved).toBe('use this: the-answer');
  });

  it('leaves unresolved tokens if the dependency is not done', () => {
    const g = new TaskGraph([
      { id: 'a', agentId: 'x', prompt: '' },
      { id: 'b', agentId: 'x', prompt: 'ref: {{results.a}}', depends: ['a'] },
    ]);
    // do NOT mark 'a' as done
    const resolved = g.resolvePrompt('b');
    expect(resolved).toBe('ref: {{results.a}}');
  });

  // ── summarise ─────────────────────────────────────────────

  it('summarise includes done and failed statuses', () => {
    const g = new TaskGraph([
      { id: 'ok',  agentId: 'x', prompt: '', label: 'Task A' },
      { id: 'err', agentId: 'x', prompt: '', label: 'Task B' },
    ]);
    g.markRunning('ok');  g.markDone('ok', 'good result');
    g.markRunning('err'); g.markFailed('err', 'bad error');
    const summary = g.summarise();
    expect(summary).toContain('✓');
    expect(summary).toContain('Task A');
    expect(summary).toContain('✗');
    expect(summary).toContain('Task B');
    expect(summary).toContain('bad error');
  });
});
