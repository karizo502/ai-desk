import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import type { SkillDefinition } from '../skills/skill.js';

function makeSkill(overrides: Partial<SkillDefinition> & { name: string }): SkillDefinition {
  return {
    version: '1.0.0',
    description: `Skill ${overrides.name}`,
    provenance: 'generated',
    revision: 1,
    sourceSessionId: `sess-${overrides.name}`,
    createdAt: Date.now(),
    ...overrides,
  };
}

let tmpDir: string;
let registry: SkillRegistry;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-anti-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function registerAndEnable(def: SkillDefinition): void {
  registry.registerGenerated(def, join(tmpDir, `${def.name}.skill.json`));
  registry.approve(def.name);
}

describe('Anti-skill — kind=avoid injected as AVOID block', () => {
  it('positive skill appears in main body, not AVOID block', () => {
    registerAndEnable(makeSkill({
      name: 'helpful-skill',
      kind: 'positive',
      systemPromptAddition: 'Always be helpful.',
    }));

    const prompt = registry.composedSystemPrompt();
    expect(prompt).toContain('Always be helpful.');
    expect(prompt).not.toContain('AVOID');
  });

  it('avoid skill appears in AVOID block', () => {
    registerAndEnable(makeSkill({
      name: 'bad-pattern-avoid',
      kind: 'avoid',
      systemPromptAddition: 'Do not delete files without confirmation.',
    }));

    const prompt = registry.composedSystemPrompt();
    expect(prompt).toContain('AVOID');
    expect(prompt).toContain('Do not delete files without confirmation.');
    expect(prompt).not.toMatch(/^Do not delete/m); // not in main body directly
  });

  it('mixed skills: positive in body, avoid in AVOID block', () => {
    registerAndEnable(makeSkill({
      name: 'positive-skill',
      kind: 'positive',
      systemPromptAddition: 'Format output as markdown.',
    }));
    registerAndEnable(makeSkill({
      name: 'risky-avoid',
      kind: 'avoid',
      systemPromptAddition: 'Do not use raw SQL string interpolation.',
    }));

    const prompt = registry.composedSystemPrompt();
    // Positive before AVOID block
    const posIdx = prompt.indexOf('Format output as markdown.');
    const avoidIdx = prompt.indexOf('AVOID');
    expect(posIdx).toBeGreaterThan(-1);
    expect(avoidIdx).toBeGreaterThan(-1);
    expect(posIdx).toBeLessThan(avoidIdx);
    expect(prompt).toContain('Do not use raw SQL string interpolation.');
  });

  it('agentSystemPrompt filters by skill list and kind', () => {
    registerAndEnable(makeSkill({
      name: 'skill-a',
      kind: 'positive',
      systemPromptAddition: 'Skill A instructions.',
    }));
    registerAndEnable(makeSkill({
      name: 'skill-b-avoid',
      kind: 'avoid',
      systemPromptAddition: 'Avoid pattern B.',
    }));

    // Only include skill-a in agent
    const prompt = registry.agentSystemPrompt(['skill-a']);
    expect(prompt).toContain('Skill A instructions.');
    expect(prompt).not.toContain('Avoid pattern B.');

    // Include both
    const prompt2 = registry.agentSystemPrompt(['skill-a', 'skill-b-avoid']);
    expect(prompt2).toContain('Skill A instructions.');
    expect(prompt2).toContain('Avoid pattern B.');
    expect(prompt2).toContain('AVOID');
  });
});
