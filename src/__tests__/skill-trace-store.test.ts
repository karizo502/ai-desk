import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillTraceStore } from '../memory/skill-trace-store.js';

let tmpDir: string;
let store: SkillTraceStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-trace-'));
  store = new SkillTraceStore(tmpDir);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SkillTraceStore', () => {
  it('initialises and retrieves a session', () => {
    store.initSession('s1', 'agent-a', ['code-review']);
    const session = store.getSession('s1');
    expect(session).not.toBeNull();
    expect(session!.agentId).toBe('agent-a');
    expect(session!.skillsUsed).toEqual(['code-review']);
    expect(session!.toolCount).toBe(0);
  });

  it('records turns and increments tool count', () => {
    store.initSession('s2', 'agent-a');
    store.recordTurn({ sessionId: 's2', idx: 0, role: 'user', content: 'hello world' });
    store.recordTurn({ sessionId: 's2', idx: 1, role: 'tool', content: 'tool result', toolName: 'read_file' });

    const session = store.getSession('s2');
    expect(session!.toolCount).toBe(1);

    const turns = store.getTrace('s2');
    expect(turns).toHaveLength(2);
    expect(turns[0].role).toBe('user');
    expect(turns[1].role).toBe('tool');
    expect(turns[1].toolName).toBe('read_file');
  });

  it('finalises a session with outcome and token count', () => {
    store.initSession('s3', 'agent-a');
    store.recordTurn({ sessionId: 's3', idx: 0, role: 'user', content: 'do something' });
    store.finalizeSession('s3', 'success', 1234);

    const session = store.getSession('s3');
    expect(session!.outcome).toBe('success');
    expect(session!.tokenCount).toBe(1234);
    expect(session!.traceHash).toBeTruthy();
    expect(session!.endedAt).toBeGreaterThan(0);
  });

  it('searches turns with FTS5', () => {
    store.initSession('s4', 'agent-a');
    store.recordTurn({ sessionId: 's4', idx: 0, role: 'user', content: 'refactor the authentication module' });
    store.finalizeSession('s4', 'success', 100);

    const results = store.search('authentication');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sessionId).toBe('s4');
  });

  it('returns empty array for unmatched search', () => {
    const results = store.search('xyzzy-unknown-token-12345');
    expect(results).toEqual([]);
  });

  it('lists synthesis candidates by tool count threshold', () => {
    store.initSession('s5', 'agent-a');
    for (let i = 0; i < 9; i++) {
      store.recordTurn({ sessionId: 's5', idx: i, role: 'tool', content: `result ${i}`, toolName: 'some_tool' });
    }
    store.finalizeSession('s5', 'success', 500);

    store.initSession('s6', 'agent-a');
    store.recordTurn({ sessionId: 's6', idx: 0, role: 'tool', content: 'r', toolName: 'tool' });
    store.finalizeSession('s6', 'success', 50);

    const candidates = store.listSynthesisCandidates(8);
    expect(candidates.map(c => c.id)).toContain('s5');
    expect(candidates.map(c => c.id)).not.toContain('s6');
  });

  it('saves and retrieves a summary', () => {
    store.initSession('s7', 'agent-a');
    store.saveSummary('s7', 'This session did X and Y');
    const session = store.getSession('s7');
    expect(session!.summary).toBe('This session did X and Y');
  });
});
