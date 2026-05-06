import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkSkillDefinition, checkGeneratedSkillDefinition } from '../skills/skill.schema.js';

const SKILLS_DIR = resolve('skills');

describe('checkSkillDefinition — builtin skills backward compat', () => {
  const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.skill.json'));

  it('has at least one builtin skill', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`validates ${file}`, () => {
      const raw = JSON.parse(readFileSync(join(SKILLS_DIR, file), 'utf-8'));
      const errors = checkSkillDefinition(raw);
      expect(errors).toBeNull();
    });
  }
});

describe('checkGeneratedSkillDefinition — security invariants', () => {
  const validGenerated = {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test generated skill',
    provenance: 'generated' as const,
    revision: 1,
    sourceSessionId: 'session-abc-123',
    createdAt: Date.now(),
    systemPromptAddition: 'Always greet the user politely.',
    toolAllowlist: ['read_file'],
  };

  it('accepts a valid generated skill', () => {
    expect(checkGeneratedSkillDefinition(validGenerated)).toBeNull();
  });

  it('rejects a skill with mcpServer', () => {
    const withMcp = {
      ...validGenerated,
      mcpServer: { command: 'node', args: ['server.js'], capabilities: [], sandbox: true },
    };
    const errors = checkGeneratedSkillDefinition(withMcp);
    expect(errors).not.toBeNull();
    expect(errors!.join(' ')).toContain('mcpServer');
  });

  it('rejects missing provenance', () => {
    const { provenance: _, ...missing } = validGenerated;
    const errors = checkGeneratedSkillDefinition(missing);
    expect(errors).not.toBeNull();
  });

  it('rejects provenance != generated', () => {
    const errors = checkGeneratedSkillDefinition({ ...validGenerated, provenance: 'builtin' });
    expect(errors).not.toBeNull();
  });

  it('rejects missing sourceSessionId', () => {
    const { sourceSessionId: _, ...missing } = validGenerated;
    const errors = checkGeneratedSkillDefinition(missing);
    expect(errors).not.toBeNull();
  });

  it('rejects invalid name pattern (uppercase)', () => {
    const errors = checkGeneratedSkillDefinition({ ...validGenerated, name: 'TestSkill' });
    expect(errors).not.toBeNull();
  });

  it('rejects revision < 1', () => {
    const errors = checkGeneratedSkillDefinition({ ...validGenerated, revision: 0 });
    expect(errors).not.toBeNull();
  });
});
