import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillMerger } from '../skills/skill-merger.js';
import type { SkillDefinition } from '../skills/skill.js';
import type { ModelRouter } from '../models/model-router.js';

function makeSkill(overrides: Partial<SkillDefinition> & { name: string }): SkillDefinition {
  return {
    version: '1.0.0',
    description: `Description for ${overrides.name}`,
    provenance: 'generated',
    revision: 1,
    sourceSessionId: `sess-${overrides.name}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

const mockRouter = {
  call: vi.fn().mockResolvedValue({ content: 'Merged description.' }),
  pickModel: vi.fn().mockReturnValue('anthropic/claude-haiku-4-5'),
} as unknown as ModelRouter;

let tmpDir: string;
let registry: SkillRegistry;
let merger: SkillMerger;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-merger-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  merger = new SkillMerger({ registry, router: mockRouter, outputDir: join(tmpDir, 'generated') });
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function registerAndEnable(def: SkillDefinition): void {
  registry.registerGenerated(def, join(tmpDir, `${def.name}.skill.json`));
  registry.approve(def.name);
}

describe('SkillMerger — merge()', () => {
  it('merges tool allowlists from both skills', async () => {
    registerAndEnable(makeSkill({ name: 'skill-a', toolAllowlist: ['read_file', 'glob'] }));
    registerAndEnable(makeSkill({ name: 'skill-b', toolAllowlist: ['write_file', 'glob'] }));

    const result = await merger.merge('skill-a', 'skill-b', { dryRun: true });

    expect(result.errors).toBeUndefined();
    expect(result.conflict).toBeUndefined();
    expect(result.merged!.toolAllowlist).toEqual(expect.arrayContaining(['read_file', 'glob', 'write_file']));
    expect(result.merged!.toolAllowlist).toHaveLength(3); // deduped
  });

  it('merges systemPromptAddition from both skills', async () => {
    registerAndEnable(makeSkill({
      name: 'skill-a',
      systemPromptAddition: 'Do A well.',
    }));
    registerAndEnable(makeSkill({
      name: 'skill-b',
      systemPromptAddition: 'Do B carefully.',
    }));

    const result = await merger.merge('skill-a', 'skill-b', { dryRun: true });

    expect(result.merged!.systemPromptAddition).toContain('Do A well.');
    expect(result.merged!.systemPromptAddition).toContain('Do B carefully.');
  });

  it('merges tags as union', async () => {
    registerAndEnable(makeSkill({ name: 'skill-a', tags: ['sql', 'database'] }));
    registerAndEnable(makeSkill({ name: 'skill-b', tags: ['database', 'performance'] }));

    const result = await merger.merge('skill-a', 'skill-b', { dryRun: true });

    expect(result.merged!.tags).toEqual(expect.arrayContaining(['sql', 'database', 'performance']));
    expect(result.merged!.tags).toHaveLength(3);
  });

  it('avoid kind wins when either parent is avoid', async () => {
    registerAndEnable(makeSkill({ name: 'skill-a', kind: 'positive' }));
    registerAndEnable(makeSkill({ name: 'skill-b', kind: 'avoid' }));

    const result = await merger.merge('skill-a', 'skill-b', { dryRun: true });

    expect(result.merged!.kind).toBe('avoid');
  });

  it('blocks merge when both skills have mcpServer', async () => {
    // Use registerExternal for builtin skills with mcpServer (generated validation rejects mcpServer)
    const mcp = (name: string, cmd: string): SkillDefinition => ({
      ...makeSkill({ name, provenance: 'builtin' as const }),
      mcpServer: { command: cmd, capabilities: [], sandbox: true },
    });
    registry.registerExternal(mcp('skill-a', 'server-a'), join(tmpDir, 'skill-a.skill.json'));
    registry.enable('skill-a');
    registry.registerExternal(mcp('skill-b', 'server-b'), join(tmpDir, 'skill-b.skill.json'));
    registry.enable('skill-b');

    const result = await merger.merge('skill-a', 'skill-b', { dryRun: true });

    expect(result.conflict).toBeTruthy();
    expect(result.merged).toBeUndefined();
  });

  it('returns error when skill not found', async () => {
    registerAndEnable(makeSkill({ name: 'skill-a' }));

    const result = await merger.merge('skill-a', 'nonexistent', { dryRun: true });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('nonexistent');
  });

  it('writes file to disk when not dry-run', async () => {
    registerAndEnable(makeSkill({ name: 'skill-x', systemPromptAddition: 'X instructions.' }));
    registerAndEnable(makeSkill({ name: 'skill-y', systemPromptAddition: 'Y instructions.' }));

    const result = await merger.merge('skill-x', 'skill-y', { mergedName: 'xy-merged' });

    expect(result.filePath).toBeTruthy();
    expect(existsSync(result.filePath!)).toBe(true);
    expect(registry.get('xy-merged')).toBeTruthy();
  });

  it('uses custom merged name when provided', async () => {
    registerAndEnable(makeSkill({ name: 'skill-p' }));
    registerAndEnable(makeSkill({ name: 'skill-q' }));

    const result = await merger.merge('skill-p', 'skill-q', { dryRun: true, mergedName: 'pq-custom' });

    expect(result.merged!.name).toBe('pq-custom');
  });

  it('defaults merged name to <a>-<b>-merged', async () => {
    registerAndEnable(makeSkill({ name: 'skill-m' }));
    registerAndEnable(makeSkill({ name: 'skill-n' }));

    const result = await merger.merge('skill-m', 'skill-n', { dryRun: true });

    expect(result.merged!.name).toBe('skill-m-skill-n-merged');
  });
});

describe('SkillMerger — scope resolution', () => {
  it('picks narrowest scope (agent < project)', async () => {
    registerAndEnable(makeSkill({ name: 'scope-a', scope: 'project' }));
    registerAndEnable(makeSkill({ name: 'scope-b', scope: 'agent', allowedAgents: ['agent-1'] }));

    const result = await merger.merge('scope-a', 'scope-b', { dryRun: true });

    expect(result.merged!.scope).toBe('agent');
    expect(result.merged!.allowedAgents).toContain('agent-1');
  });

  it('picks narrowest scope (project < global)', async () => {
    registerAndEnable(makeSkill({ name: 'scope-c', scope: 'global' }));
    registerAndEnable(makeSkill({ name: 'scope-d', scope: 'project' }));

    const result = await merger.merge('scope-c', 'scope-d', { dryRun: true });

    expect(result.merged!.scope).toBe('project');
  });
});

describe('SkillMerger — findMergeCandidates()', () => {
  it('returns pairs with overlapping tags', () => {
    registerAndEnable(makeSkill({ name: 'cand-a', tags: ['sql', 'database', 'query'] }));
    registerAndEnable(makeSkill({ name: 'cand-b', tags: ['sql', 'database', 'optimization'] }));

    const pairs = merger.findMergeCandidates();
    const names = pairs.map(([a, b]) => [a, b].sort().join('+'));
    expect(names).toContain('cand-a+cand-b');
  });

  it('does not suggest pairs with no tag overlap', () => {
    registerAndEnable(makeSkill({ name: 'unrelated-a', tags: ['python'] }));
    registerAndEnable(makeSkill({ name: 'unrelated-b', tags: ['docker'] }));

    const pairs = merger.findMergeCandidates();
    expect(pairs.length).toBe(0);
  });
});

describe('SkillMerger — archiveSources()', () => {
  it('archives both source skills', () => {
    registerAndEnable(makeSkill({ name: 'src-a' }));
    registerAndEnable(makeSkill({ name: 'src-b' }));

    merger.archiveSources('src-a', 'src-b');

    expect(registry.get('src-a')).toBeUndefined();
    expect(registry.get('src-b')).toBeUndefined();
  });
});
