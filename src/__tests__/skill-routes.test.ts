import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../skills/skill-registry.js';
import { SkillRoutes } from '../dashboard/skill-routes.js';
import type { SkillDefinition } from '../skills/skill.js';

// ── Minimal HTTP mock helpers ─────────────────────────────────────────────────

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead(code: number, hdrs?: Record<string, string>): void;
  end(data?: string): void;
}

function mockRes(): MockRes {
  const r: MockRes = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, hdrs = {}) { r.statusCode = code; Object.assign(r.headers, hdrs); },
    end(data = '') { r.body += data; },
  };
  return r;
}

function mockReq(method: string, url: string): import('node:http').IncomingMessage {
  return { method, url } as any;
}

function parseBody(res: MockRes): unknown {
  return JSON.parse(res.body);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GENERATED: SkillDefinition = {
  name: 'auto-review',
  version: '1.0.0',
  description: 'Automatically reviews pull requests using a checklist.',
  provenance: 'generated',
  revision: 1,
  sourceSessionId: 'session-001',
  createdAt: Date.now(),
  systemPromptAddition: 'Review PRs using the established checklist.',
  toolAllowlist: ['read_file'],
};

let tmpDir: string;
let registry: SkillRegistry;
let routes: SkillRoutes;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-desk-skillroutes-'));
  registry = new SkillRegistry(tmpDir, []);
  await registry.init();
  routes = new SkillRoutes(registry);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillRoutes — GET /dashboard/api/skills', () => {
  it('returns empty list when no skills loaded', () => {
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { skills: unknown[] };
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it('returns registered skill in list', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills'), res as any);
    const body = parseBody(res) as { skills: Array<{ name: string; pendingApproval: boolean }> };
    const found = body.skills.find(s => s.name === 'auto-review');
    expect(found).toBeDefined();
    expect(found?.pendingApproval).toBe(true);
  });
});

describe('SkillRoutes — GET /dashboard/api/skills/pending', () => {
  it('returns only pending-approval skills', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/pending'), res as any);
    const body = parseBody(res) as { skills: Array<{ name: string }> };
    expect(body.skills.map(s => s.name)).toContain('auto-review');
  });

  it('returns empty when no pending skills', () => {
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/pending'), res as any);
    const body = parseBody(res) as { skills: unknown[] };
    expect(body.skills).toHaveLength(0);
  });
});

describe('SkillRoutes — GET /dashboard/api/skills/:name', () => {
  it('returns skill detail', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/auto-review'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { name: string; provenance: string };
    expect(body.name).toBe('auto-review');
    expect(body.provenance).toBe('generated');
  });

  it('returns 404 for unknown skill', () => {
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/nonexistent'), res as any);
    expect(res.statusCode).toBe(404);
  });
});

describe('SkillRoutes — POST /dashboard/api/skills/:name/approve', () => {
  it('approves a pending skill', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    const res = mockRes();
    routes.handle(mockReq('POST', '/dashboard/api/skills/auto-review/approve'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { ok: boolean; skill: { pendingApproval: boolean; enabled: boolean } };
    expect(body.ok).toBe(true);
    expect(body.skill.pendingApproval).toBe(false);
    expect(body.skill.enabled).toBe(true);
  });

  it('returns 404 when skill not found', () => {
    const res = mockRes();
    routes.handle(mockReq('POST', '/dashboard/api/skills/ghost/approve'), res as any);
    expect(res.statusCode).toBe(404);
  });
});

describe('SkillRoutes — POST /dashboard/api/skills/:name/reject', () => {
  it('rejects a pending skill', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    const res = mockRes();
    routes.handle(mockReq('POST', '/dashboard/api/skills/auto-review/reject'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { ok: boolean };
    expect(body.ok).toBe(true);
    // Skill should no longer be pending
    expect(registry.listPendingApproval()).toHaveLength(0);
  });
});

describe('SkillRoutes — POST /dashboard/api/skills/:name/archive', () => {
  it('archives a skill', () => {
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    registry.approve('auto-review');
    const res = mockRes();
    routes.handle(mockReq('POST', '/dashboard/api/skills/auto-review/archive'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { ok: boolean };
    expect(body.ok).toBe(true);
    // Archived skill removed from registry
    expect(registry.get('auto-review')).toBeUndefined();
  });
});

describe('SkillRoutes — GET /dashboard/api/skills/conflicts', () => {
  it('returns conflict report for pending skills', () => {
    const conflicting: SkillDefinition = {
      ...GENERATED,
      name: 'auto-review-2',
      description: 'Reviews PRs automatically using a checklist and guidelines.',
      systemPromptAddition: 'Review pull requests using the established checklist always.',
    };
    registry.registerGenerated(GENERATED, join(tmpDir, 'auto-review.skill.json'));
    registry.approve('auto-review');
    registry.registerGenerated(conflicting, join(tmpDir, 'auto-review-2.skill.json'));

    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/conflicts'), res as any);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res) as { conflicts: Array<{ skillName: string; severity: string }> };
    expect(Array.isArray(body.conflicts)).toBe(true);
    // auto-review-2 is pending and overlaps with enabled auto-review
    const report = body.conflicts.find(c => c.skillName === 'auto-review-2');
    expect(report).toBeDefined();
    expect(['warn', 'block']).toContain(report?.severity);
  });

  it('returns empty conflicts array when no pending skills', () => {
    const res = mockRes();
    routes.handle(mockReq('GET', '/dashboard/api/skills/conflicts'), res as any);
    const body = parseBody(res) as { conflicts: unknown[] };
    expect(body.conflicts).toHaveLength(0);
  });
});

describe('SkillRoutes — unhandled routes', () => {
  it('returns false for unrecognised URLs', () => {
    const res = mockRes();
    const handled = routes.handle(mockReq('GET', '/dashboard/api/other'), res as any);
    expect(handled).toBe(false);
  });
});
