import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import type { SkillDefinition } from '../skills/skill.ts';

let tmpDir: string;
let registry: SkillRegistry;

const validGenerated: SkillDefinition = {
  name: 'auto-review',
  version: '1.0.0',
  description: 'Automatically reviews pull requests',
  provenance: 'generated',
  revision: 1,
  sourceSessionId: 'session-xyz-999',
  createdAt: Date.now(),
  toolAllowlist: ['read_file', 'glob'],
  systemPromptAddition: 'Review PRs using the established checklist.',
};

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-reg-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SkillRegistry — generated skills', () => {
  it('registers a valid generated skill as pending approval', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    const pending = registry.listPendingApproval();
    expect(pending.map(s => s.definition.name)).toContain('auto-review');
  });

  it('generated skill is disabled by default', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    const skill = registry.get('auto-review');
    expect(skill?.state.enabled).toBe(false);
  });

  it('rejects a generated skill with mcpServer', () => {
    const withMcp: SkillDefinition = {
      ...validGenerated,
      name: 'bad-skill',
      mcpServer: { command: 'node', args: [], capabilities: [], sandbox: true },
    };
    expect(() => registry.registerGenerated(withMcp, '/tmp/bad.skill.json'))
      .toThrow(/mcpServer/);
  });

  it('rejects a generated skill with wrong provenance', () => {
    const wrong: SkillDefinition = { ...validGenerated, name: 'wrong-prov', provenance: 'builtin' };
    expect(() => registry.registerGenerated(wrong, '/tmp/wrong.skill.json')).toThrow();
  });

  it('approves a pending skill and enables it', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    const ok = registry.approve('auto-review');
    expect(ok).toBe(true);
    expect(registry.get('auto-review')?.state.enabled).toBe(true);
    expect(registry.get('auto-review')?.state.pendingApproval).toBe(false);
    expect(registry.listPendingApproval()).toHaveLength(0);
  });

  it('rejects a pending skill (keeps disabled)', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    const ok = registry.reject('auto-review');
    expect(ok).toBe(true);
    expect(registry.get('auto-review')?.state.enabled).toBe(false);
    expect(registry.get('auto-review')?.state.pendingApproval).toBe(false);
  });

  it('recordUsage updates metrics correctly', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    registry.recordUsage('auto-review', true, -50);
    registry.recordUsage('auto-review', false, 10);
    const metrics = registry.get('auto-review')?.state.metrics;
    expect(metrics?.uses).toBe(2);
    expect(metrics?.successes).toBe(1);
    expect(metrics?.failures).toBe(1);
    expect(metrics?.avgTokensSaved).toBeDefined();
  });

  it('listGenerated only returns generated provenance', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    const generated = registry.listGenerated();
    for (const s of generated) {
      expect(s.definition.provenance).toBe('generated');
    }
    expect(generated.map(s => s.definition.name)).toContain('auto-review');
  });

  it('archives a skill and removes it from the registry', () => {
    registry.registerGenerated(validGenerated, '/tmp/auto-review.skill.json');
    expect(registry.get('auto-review')).toBeDefined();
    registry.archive('auto-review');
    expect(registry.get('auto-review')).toBeUndefined();
  });
});
