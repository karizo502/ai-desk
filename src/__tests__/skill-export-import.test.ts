import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import { exportSkill, type SkillBundle } from '../skills/skill-export.js';
import { importSkill } from '../skills/skill-import.js';
import type { SkillDefinition } from '../skills/skill.js';

function makeSkill(overrides: Partial<SkillDefinition> & { name: string }): SkillDefinition {
  return {
    version: '1.0.0',
    description: `Skill ${overrides.name}`,
    provenance: 'generated',
    revision: 1,
    sourceSessionId: `sess-${overrides.name}`,
    createdAt: Date.now(),
    systemPromptAddition: `Do ${overrides.name} well.`,
    ...overrides,
  };
}

let tmpDir: string;
let registry: SkillRegistry;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-export-'));
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

describe('exportSkill()', () => {
  it('exports a skill to a JSON bundle file', () => {
    registerAndEnable(makeSkill({ name: 'export-me', tags: ['test'] }));

    const outPath = join(tmpDir, 'export-me.skill-bundle.json');
    const result = exportSkill(registry, 'export-me', outPath);

    expect(existsSync(outPath)).toBe(true);
    expect(result.filePath).toBe(outPath);
    expect(result.bundle.version).toBe('1');
    expect(result.bundle.skill.name).toBe('export-me');
  });

  it('includes checksum in exportMeta', () => {
    registerAndEnable(makeSkill({ name: 'checksum-skill' }));

    const result = exportSkill(registry, 'checksum-skill');
    expect(result.bundle.exportMeta.checksum).toHaveLength(64); // SHA-256 hex
  });

  it('redacts sourceSessionId in exported bundle', () => {
    registerAndEnable(makeSkill({
      name: 'pii-skill',
      sourceSessionId: 'sensitive-session-xyz',
    }));

    const result = exportSkill(registry, 'pii-skill');
    expect(result.bundle.skill.sourceSessionId).toBe('[redacted]');
  });

  it('redacts mcpServer env values', () => {
    registry.registerExternal(
      makeSkill({
        name: 'mcp-skill',
        provenance: 'builtin',
        mcpServer: {
          command: 'my-server',
          env: { SECRET_KEY: 'super-secret', PORT: '8080' },
          capabilities: [],
          sandbox: true,
        },
      }),
      join(tmpDir, 'mcp-skill.skill.json'),
    );

    const result = exportSkill(registry, 'mcp-skill');
    expect(result.bundle.skill.mcpServer!.env!['SECRET_KEY']).toBe('[redacted]');
    expect(result.bundle.skill.mcpServer!.env!['PORT']).toBe('[redacted]');
  });

  it('clears allowedAgents (env-specific)', () => {
    registerAndEnable(makeSkill({
      name: 'agent-scoped',
      scope: 'agent',
      allowedAgents: ['agent-local-1', 'agent-local-2'],
    }));

    const result = exportSkill(registry, 'agent-scoped');
    expect(result.bundle.skill.allowedAgents).toBeUndefined();
  });

  it('throws when skill not found', () => {
    expect(() => exportSkill(registry, 'nonexistent')).toThrow('nonexistent');
  });
});

describe('importSkill()', () => {
  it('imports a valid bundle and registers it pending approval', () => {
    registerAndEnable(makeSkill({ name: 'original-skill' }));
    const bundlePath = join(tmpDir, 'original-skill.bundle.json');
    exportSkill(registry, 'original-skill', bundlePath);

    // Archive original so name is free for reimport in a fresh registry
    const registry2 = new SkillRegistry(join(tmpDir, 'reg2'), []);

    const result = importSkill(registry2, {
      bundlePath,
      outputDir: join(tmpDir, 'imported'),
      actor: { connectionId: 'test' },
      skipConflictCheck: true,
    });

    expect(result.errors).toBeUndefined();
    expect(result.skillName).toBe('original-skill');
    expect(existsSync(result.filePath!)).toBe(true);
  });

  it('returns error on checksum mismatch (tampered bundle)', () => {
    registerAndEnable(makeSkill({ name: 'tamper-skill' }));
    const bundlePath = join(tmpDir, 'tamper.bundle.json');
    exportSkill(registry, 'tamper-skill', bundlePath);

    // Tamper with the bundle
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8')) as SkillBundle;
    bundle.skill.description = 'TAMPERED';
    writeFileSync(bundlePath, JSON.stringify(bundle), 'utf-8');

    const result = importSkill(registry, {
      bundlePath,
      outputDir: join(tmpDir, 'imported'),
      skipConflictCheck: true,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toMatch(/checksum/i);
  });

  it('returns error on invalid bundle format', () => {
    const badPath = join(tmpDir, 'bad.bundle.json');
    writeFileSync(badPath, JSON.stringify({ notABundle: true }), 'utf-8');

    const result = importSkill(registry, {
      bundlePath: badPath,
      outputDir: join(tmpDir, 'imported'),
      skipConflictCheck: true,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toMatch(/invalid bundle/i);
  });
});
