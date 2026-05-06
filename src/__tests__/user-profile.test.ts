import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserProfileStore } from '../memory/user-profile.js';

let tmpDir: string;
let store: UserProfileStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-profile-'));
  store = new UserProfileStore(tmpDir);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('UserProfileStore', () => {
  it('remembers and recalls a fact', () => {
    store.remember('agent-a', 'Prefers concise responses', 'preference', ['style']);
    const facts = store.recall('agent-a', 'concise');
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].content).toContain('concise');
  });

  it('recalls recent when no query given', () => {
    store.remember('agent-a', 'Expert in TypeScript', 'expertise');
    store.remember('agent-a', 'Prefers dark mode', 'preference');
    const facts = store.recall('agent-a');
    expect(facts.length).toBe(2);
  });

  it('forgets a specific fact', () => {
    const id = store.remember('agent-a', 'Temp fact', 'context');
    const deleted = store.forget(id);
    expect(deleted).toBe(true);
    const facts = store.recall('agent-a');
    expect(facts.find(f => f.id === id)).toBeUndefined();
  });

  it('forgets all facts for an agent', () => {
    store.remember('agent-a', 'Fact 1', 'context');
    store.remember('agent-a', 'Fact 2', 'preference');
    const count = store.forgetAll('agent-a');
    expect(count).toBe(2);
    expect(store.recall('agent-a')).toHaveLength(0);
  });

  it('recalls by category', () => {
    store.remember('agent-a', 'Expert in Go', 'expertise');
    store.remember('agent-a', 'Prefers tabs', 'preference');
    const expertise = store.recallByCategory('agent-a', 'expertise');
    expect(expertise).toHaveLength(1);
    expect(expertise[0].content).toBe('Expert in Go');
  });

  it('builds a prompt snippet with category ordering', () => {
    store.remember('agent-a', 'Senior backend engineer', 'identity');
    store.remember('agent-a', 'Expert in Rust', 'expertise');
    store.remember('agent-a', 'Prefers verbose error messages', 'preference');
    const snippet = store.toPromptSnippet('agent-a', 200);
    expect(snippet).toContain('[User profile]');
    expect(snippet).toContain('identity');
    expect(snippet).toContain('expertise');
  });

  it('truncates prompt snippet at maxTokens', () => {
    for (let i = 0; i < 30; i++) {
      store.remember('agent-a', `Fact number ${i}: ${'x'.repeat(50)}`, 'context');
    }
    const snippet = store.toPromptSnippet('agent-a', 50);
    // 50 tokens * 4 chars = 200 chars max — snippet must be short
    expect(snippet.length).toBeLessThanOrEqual(220);
  });

  it('returns empty string when no facts', () => {
    expect(store.toPromptSnippet('unknown-agent')).toBe('');
  });
});
