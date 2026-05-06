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
    systemPromptAddition: `Instructions for ${overrides.name}.`,
    ...overrides,
  };
}

let tmpDir: string;
let registry: SkillRegistry;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-scope-'));
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

describe('Skill scope — agentSystemPrompt()', () => {
  it('includes project-scoped skills for any agent', () => {
    registerAndEnable(makeSkill({ name: 'proj-skill', scope: 'project' }));

    const prompt = registry.agentSystemPrompt(['proj-skill'], 'agent-x');
    expect(prompt).toContain('Instructions for proj-skill.');
  });

  it('includes global-scoped skills for any agent', () => {
    registerAndEnable(makeSkill({ name: 'global-skill', scope: 'global' }));

    const prompt = registry.agentSystemPrompt(['global-skill'], 'agent-x');
    expect(prompt).toContain('Instructions for global-skill.');
  });

  it('includes agent-scoped skill only for allowed agent', () => {
    registerAndEnable(makeSkill({
      name: 'agent-skill',
      scope: 'agent',
      allowedAgents: ['agent-allowed'],
    }));

    const allowed = registry.agentSystemPrompt(['agent-skill'], 'agent-allowed');
    expect(allowed).toContain('Instructions for agent-skill.');

    const denied = registry.agentSystemPrompt(['agent-skill'], 'agent-denied');
    expect(denied).not.toContain('Instructions for agent-skill.');
  });

  it('includes agent-scoped skill when no agentId provided (backward compat)', () => {
    registerAndEnable(makeSkill({
      name: 'agent-skill-2',
      scope: 'agent',
      allowedAgents: ['only-this-agent'],
    }));

    const prompt = registry.agentSystemPrompt(['agent-skill-2']); // no agentId
    expect(prompt).toContain('Instructions for agent-skill-2.');
  });

  it('excludes skill not in the agentSkills list', () => {
    registerAndEnable(makeSkill({ name: 'unlisted-skill', scope: 'project' }));
    registerAndEnable(makeSkill({ name: 'listed-skill', scope: 'project' }));

    const prompt = registry.agentSystemPrompt(['listed-skill'], 'agent-x');
    expect(prompt).toContain('Instructions for listed-skill.');
    expect(prompt).not.toContain('Instructions for unlisted-skill.');
  });
});

describe('Skill scope — agentToolAllowlist()', () => {
  it('returns tools for project-scoped enabled skills', () => {
    registerAndEnable(makeSkill({
      name: 'tool-skill',
      scope: 'project',
      toolAllowlist: ['read_file', 'glob'],
    }));

    const tools = registry.agentToolAllowlist(['tool-skill'], 'agent-x');
    expect(tools).toContain('read_file');
    expect(tools).toContain('glob');
  });

  it('filters out tools for agent-scoped skill when agent not in allowedAgents', () => {
    registerAndEnable(makeSkill({
      name: 'agent-tool-skill',
      scope: 'agent',
      allowedAgents: ['special-agent'],
      toolAllowlist: ['write_file'],
    }));

    const denied = registry.agentToolAllowlist(['agent-tool-skill'], 'other-agent');
    expect(denied).not.toContain('write_file');

    const allowed = registry.agentToolAllowlist(['agent-tool-skill'], 'special-agent');
    expect(allowed).toContain('write_file');
  });

  it('deduplicates tools across multiple skills', () => {
    registerAndEnable(makeSkill({ name: 'ts-a', toolAllowlist: ['read_file', 'glob'] }));
    registerAndEnable(makeSkill({ name: 'ts-b', toolAllowlist: ['glob', 'write_file'] }));

    const tools = registry.agentToolAllowlist(['ts-a', 'ts-b']);
    expect(tools.filter(t => t === 'glob')).toHaveLength(1);
    expect(tools).toHaveLength(3);
  });
});
