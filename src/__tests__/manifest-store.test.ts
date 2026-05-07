import { describe, it, expect, beforeEach } from 'vitest';
import { ManifestStore } from '../tools/manifest-store.js';
import type { ManifestEntry } from '../shared/types.js';

const fileEntry: ManifestEntry = {
  tool: 'write_file',
  scopes: [{ kind: 'path', glob: '/workspace/proj-A/**' }],
  purpose: 'write source files',
};

const shellEntry: ManifestEntry = {
  tool: 'shell',
  scopes: [{ kind: 'command-class', class: 'build' }],
  purpose: 'run build commands',
};

const baseParams = {
  taskId: 'task-1',
  teamId: 'team-alpha',
  sessionId: 'session-1',
  goal: 'Add user settings page',
  steps: [{ title: 'Write components', intent: 'create UI files' }],
  riskSelfAssessment: 'low' as const,
  entries: [fileEntry, shellEntry],
};

describe('ManifestStore — lifecycle', () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore();
  });

  it('creates a manifest in pending state', () => {
    const m = store.create(baseParams);
    expect(m.status).toBe('pending');
    expect(m.id).toBeTruthy();
    expect(store.get(m.id)).toBe(m);
  });

  it('approve transitions status and sets timestamps', () => {
    const m = store.create(baseParams);
    const ok = store.approve(m.id, 'user');
    expect(ok).toBe(true);
    expect(store.get(m.id)!.status).toBe('approved');
    expect(store.get(m.id)!.approvedBy).toBe('user');
    expect(store.get(m.id)!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('approve fails for non-pending manifest', () => {
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
    expect(store.approve(m.id, 'user')).toBe(false); // already approved
  });

  it('reject transitions status', () => {
    const m = store.create(baseParams);
    const ok = store.reject(m.id, 'user');
    expect(ok).toBe(true);
    expect(store.get(m.id)!.status).toBe('rejected');
  });

  it('reject fails for non-pending manifest', () => {
    const m = store.create(baseParams);
    store.reject(m.id, 'user');
    expect(store.reject(m.id, 'user')).toBe(false);
  });
});

describe('ManifestStore — getActive', () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore();
  });

  it('returns undefined when no manifest exists', () => {
    expect(store.getActive('session-1')).toBeUndefined();
  });

  it('returns undefined for pending manifest', () => {
    store.create(baseParams);
    expect(store.getActive('session-1')).toBeUndefined();
  });

  it('returns approved manifest', () => {
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
    expect(store.getActive('session-1')).toBe(store.get(m.id));
  });

  it('marks expired manifest and returns undefined', () => {
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
    store.get(m.id)!.expiresAt = Date.now() - 1; // backdate to force expiry
    expect(store.getActive('session-1')).toBeUndefined();
    expect(store.get(m.id)!.status).toBe('expired');
  });

  it('does not return manifest for different session', () => {
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
    expect(store.getActive('session-other')).toBeUndefined();
  });
});

describe('ManifestStore — matchCall', () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore();
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
  });

  it('returns entry when tool and scope match', () => {
    const entry = store.matchCall('write_file', { path: '/workspace/proj-A/src/index.ts' }, 'session-1');
    expect(entry).toBeTruthy();
    expect(entry!.tool).toBe('write_file');
  });

  it('returns null when tool matches but scope does not', () => {
    const entry = store.matchCall('write_file', { path: '/etc/passwd' }, 'session-1');
    expect(entry).toBeNull();
  });

  it('returns null when tool is not in manifest', () => {
    const entry = store.matchCall('unknown_tool', { path: '/workspace/proj-A/file.ts' }, 'session-1');
    expect(entry).toBeNull();
  });

  it('returns null when no approved manifest for session', () => {
    const entry = store.matchCall('write_file', { path: '/workspace/proj-A/file.ts' }, 'session-other');
    expect(entry).toBeNull();
  });

  it('matches shell with build command class', () => {
    const entry = store.matchCall('shell', { command: 'npm run build' }, 'session-1');
    expect(entry).toBeTruthy();
    expect(entry!.tool).toBe('shell');
  });

  it('rejects shell with destructive command', () => {
    const entry = store.matchCall('shell', { command: 'rm -rf /workspace' }, 'session-1');
    expect(entry).toBeNull();
  });
});

describe('ManifestStore — listPending / listBySession', () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore();
  });

  it('listPending returns only pending manifests', () => {
    const m1 = store.create(baseParams);
    const m2 = store.create({ ...baseParams, sessionId: 'session-2', taskId: 'task-2' });
    store.approve(m1.id, 'user');
    expect(store.listPending()).toHaveLength(1);
    expect(store.listPending()[0].id).toBe(m2.id);
  });

  it('listBySession returns all manifests for session', () => {
    store.create(baseParams);
    store.create(baseParams);
    store.create({ ...baseParams, sessionId: 'session-other', taskId: 'task-x' });
    expect(store.listBySession('session-1')).toHaveLength(2);
    expect(store.listBySession('session-other')).toHaveLength(1);
  });
});

describe('ManifestStore — evictStale', () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore();
  });

  it('evicts old non-approved manifests', () => {
    const m = store.create(baseParams);
    store.reject(m.id, 'user');
    store.get(m.id)!.createdAt = Date.now() - 90_000_000; // 25 hours ago
    store.evictStale();
    expect(store.get(m.id)).toBeUndefined();
  });

  it('does not evict active approved manifests', () => {
    const m = store.create(baseParams);
    store.approve(m.id, 'user');
    store.get(m.id)!.createdAt = Date.now() - 90_000_000;
    store.evictStale();
    expect(store.get(m.id)).toBeDefined();
  });
});
