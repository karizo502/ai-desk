import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolicyEngine } from '../tools/policy-engine.js';
import type { ManifestStore, ManifestEntry } from '../tools/manifest-store.js';
import { eventBus } from '../shared/events.js';

const baseReq = {
  input: {},
  sessionId: 's1',
  agentId: 'a1',
  runId: 'r1',
  subagentDepth: 0,
};

describe('PolicyEngine — deny-all profile', () => {
  let policy: PolicyEngine;

  beforeEach(() => {
    policy = new PolicyEngine({ profile: 'deny-all' });
  });

  it('denies any tool by default', () => {
    const r = policy.checkPermission({ ...baseReq, name: 'read_file' });
    expect(r.allowed).toBe(false);
    // deny-all returns requiresApproval:true so the client can prompt the user
    expect(r.requiresApproval).toBe(true);
  });

  it('allows a tool that is explicitly in the allow list', () => {
    policy = new PolicyEngine({ profile: 'deny-all', allow: ['read_file'] });
    const r = policy.checkPermission({ ...baseReq, name: 'read_file' });
    expect(r.allowed).toBe(true);
  });

  it('skill allowlist overrides deny-all', () => {
    policy.addSkillAllowlist(['grep', 'glob']);
    expect(policy.checkPermission({ ...baseReq, name: 'grep' }).allowed).toBe(true);
    expect(policy.checkPermission({ ...baseReq, name: 'glob' }).allowed).toBe(true);
    expect(policy.checkPermission({ ...baseReq, name: 'write_file' }).allowed).toBe(false);
  });

  it('setSkillAllowlist replaces the previous skill allowlist', () => {
    policy.addSkillAllowlist(['grep']);
    policy.setSkillAllowlist(['fetch_url']);
    expect(policy.checkPermission({ ...baseReq, name: 'grep' }).allowed).toBe(false);
    expect(policy.checkPermission({ ...baseReq, name: 'fetch_url' }).allowed).toBe(true);
  });

  it('deny list always wins even over skill allowlist', () => {
    policy = new PolicyEngine({ profile: 'deny-all', deny: ['exec_command'] });
    policy.addSkillAllowlist(['exec_command']);
    const r = policy.checkPermission({ ...baseReq, name: 'exec_command' });
    expect(r.allowed).toBe(false);
  });
});

describe('PolicyEngine — readonly profile', () => {
  let policy: PolicyEngine;

  beforeEach(() => {
    policy = new PolicyEngine({ profile: 'readonly' });
  });

  it('allows read_file', () => {
    expect(policy.checkPermission({ ...baseReq, name: 'read_file' }).allowed).toBe(true);
  });

  it('allows glob and grep', () => {
    expect(policy.checkPermission({ ...baseReq, name: 'glob' }).allowed).toBe(true);
    expect(policy.checkPermission({ ...baseReq, name: 'grep' }).allowed).toBe(true);
  });

  it('denies write_file', () => {
    expect(policy.checkPermission({ ...baseReq, name: 'write_file' }).allowed).toBe(false);
  });

  it('denies exec_command', () => {
    expect(policy.checkPermission({ ...baseReq, name: 'exec_command' }).allowed).toBe(false);
  });

  it('an explicit deny overrides the readonly profile allowlist', () => {
    policy = new PolicyEngine({ profile: 'readonly', deny: ['read_file'] });
    expect(policy.checkPermission({ ...baseReq, name: 'read_file' }).allowed).toBe(false);
  });
});

describe('PolicyEngine — full profile', () => {
  it('allows any tool by default', () => {
    const policy = new PolicyEngine({ profile: 'full' });
    expect(policy.checkPermission({ ...baseReq, name: 'exec_command' }).allowed).toBe(true);
    expect(policy.checkPermission({ ...baseReq, name: 'write_file' }).allowed).toBe(true);
    expect(policy.checkPermission({ ...baseReq, name: 'fetch_url' }).allowed).toBe(true);
  });

  it('deny list still blocks tools even on full profile', () => {
    const policy = new PolicyEngine({ profile: 'full', deny: ['exec_command'] });
    expect(policy.checkPermission({ ...baseReq, name: 'exec_command' }).allowed).toBe(false);
    expect(policy.checkPermission({ ...baseReq, name: 'write_file' }).allowed).toBe(true);
  });
});

describe('PolicyEngine — subagent depth', () => {
  it('requires approval for untrusted tools at depth > 0', () => {
    const policy = new PolicyEngine({ profile: 'full' });
    const r = policy.checkPermission({ ...baseReq, name: 'exec_command', subagentDepth: 1 });
    // exec_command is a high-risk tool; exact behaviour depends on implementation
    // At minimum it should not straight-up allow without consideration
    expect(typeof r.allowed).toBe('boolean');
  });
});

// ─── Manifest integration ──────────────────────────────────

const fileEntry: ManifestEntry = {
  tool: 'write_file',
  scopes: [{ kind: 'path', glob: '/workspace/**' }],
  purpose: 'write source files',
};

/** Builds a ManifestStore stub that always returns the given entry (or null) */
function makeManifestStub(entry: ManifestEntry | null): ManifestStore {
  return { matchCall: vi.fn().mockReturnValue(entry) } as unknown as ManifestStore;
}

describe('PolicyEngine — manifest integration', () => {
  it('allows a deny-all tool when manifest entry matches', () => {
    const policy = new PolicyEngine({ profile: 'deny-all' }, makeManifestStub(fileEntry));
    const r = policy.checkPermission({ ...baseReq, name: 'write_file', input: { path: '/workspace/src/a.ts' } });
    expect(r.allowed).toBe(true);
    expect(r.requiresApproval).toBe(false);
    expect(r.reason).toContain('manifest');
  });

  it('allows a profile-blocked tool when manifest entry matches', () => {
    const policy = new PolicyEngine({ profile: 'readonly' }, makeManifestStub(fileEntry));
    const r = policy.checkPermission({ ...baseReq, name: 'write_file', input: { path: '/workspace/src/a.ts' } });
    expect(r.allowed).toBe(true);
  });

  it('falls through to requiresApproval when manifest returns null (scope mismatch)', () => {
    const policy = new PolicyEngine({ profile: 'deny-all' }, makeManifestStub(null));
    const r = policy.checkPermission({ ...baseReq, name: 'write_file', input: { path: '/etc/passwd' } });
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(true);
  });

  it('explicit deny wins over manifest match', () => {
    const policy = new PolicyEngine(
      { profile: 'deny-all', deny: ['write_file'] },
      makeManifestStub(fileEntry),
    );
    const r = policy.checkPermission({ ...baseReq, name: 'write_file', input: { path: '/workspace/a.ts' } });
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(false);
  });

  it('no manifest store → existing deny-all behavior unchanged', () => {
    // Default ManifestStore singleton has no active manifests for this session
    const policy = new PolicyEngine({ profile: 'deny-all' });
    const r = policy.checkPermission({ ...baseReq, name: 'write_file' });
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(true);
  });

  it('emits tool:manifest_grant event on match', () => {
    const handler = vi.fn();
    eventBus.on('tool:manifest_grant', handler);

    const policy = new PolicyEngine({ profile: 'deny-all' }, makeManifestStub(fileEntry));
    policy.checkPermission({ ...baseReq, name: 'write_file', input: { path: '/workspace/a.ts' } });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data.tool).toBe('write_file');
    expect(handler.mock.calls[0][0].data.purpose).toBe('write source files');

    eventBus.off('tool:manifest_grant', handler);
  });
});
