import { describe, it, expect, vi } from 'vitest';
import { LeadPlanner } from '../agents/lead-planner.js';
import { ManifestStore } from '../tools/manifest-store.js';
import type { ModelRouter } from '../models/model-router.js';

const mockTasks = [
  { id: 't1', agentId: 'dev', label: 'Write API', prompt: 'Create REST endpoints', depends: [] },
  { id: 't2', agentId: 'tester', label: 'Write tests', prompt: 'Write unit tests for API', depends: ['t1'] },
];

const validManifestJson = JSON.stringify({
  steps: [
    { title: 'Write API', intent: 'Create REST endpoints' },
    { title: 'Test', intent: 'Verify functionality' },
  ],
  entries: [
    { tool: 'write_file', scopes: [{ kind: 'path', glob: '/workspace/**' }], purpose: 'write source', estimatedCalls: 5 },
    { tool: 'shell', scopes: [{ kind: 'command-class', class: 'build' }], purpose: 'run tests', estimatedCalls: 3 },
    { tool: 'read_file', scopes: [{ kind: 'any' }], purpose: 'read existing files', estimatedCalls: 10 },
  ],
  riskSelfAssessment: 'medium',
});

function makeRouter(content: string): ModelRouter {
  return {
    call: vi.fn().mockResolvedValue({
      content,
      toolCalls: [],
      stopReason: 'end_turn',
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, estimatedCost: 0.001 },
    }),
    pickModel: vi.fn().mockReturnValue('test-model'),
  } as unknown as ModelRouter;
}

describe('LeadPlanner.planFromTasks', () => {
  it('creates a pending manifest from valid JSON response', async () => {
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter(validManifestJson), store);

    const manifest = await planner.planFromTasks({
      goal: 'Build a REST API',
      teamId: 'team-alpha',
      teamName: 'Alpha',
      tasks: mockTasks,
    });

    expect(manifest.status).toBe('pending');
    expect(manifest.teamId).toBe('team-alpha');
    expect(manifest.sessionId).toBe('team-alpha');
    expect(manifest.goal).toBe('Build a REST API');
    expect(manifest.entries).toHaveLength(3);
    expect(manifest.entries[0].tool).toBe('write_file');
    expect(manifest.entries[1].tool).toBe('shell');
    expect(manifest.riskSelfAssessment).toBe('medium');
    expect(manifest.steps).toHaveLength(2);
  });

  it('falls back to empty manifest (risk=high) on malformed JSON', async () => {
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter('this is not json at all'), store);

    const manifest = await planner.planFromTasks({
      goal: 'Build something',
      teamId: 'team-beta',
      teamName: 'Beta',
      tasks: mockTasks,
    });

    expect(manifest.status).toBe('pending');
    expect(manifest.entries).toHaveLength(0);
    expect(manifest.riskSelfAssessment).toBe('high');
  });

  it('strips markdown fences from model response', async () => {
    const fencedJson = '```json\n' + validManifestJson + '\n```';
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter(fencedJson), store);

    const manifest = await planner.planFromTasks({
      goal: 'Build a REST API',
      teamId: 'team-gamma',
      teamName: 'Gamma',
      tasks: mockTasks,
    });

    expect(manifest.entries).toHaveLength(3);
  });

  it('filters out entries with invalid scope kinds', async () => {
    const badJson = JSON.stringify({
      steps: [],
      entries: [
        { tool: 'write_file', scopes: [{ kind: 'invalid-kind', glob: '/workspace/**' }], purpose: 'x' },
        { tool: 'read_file', scopes: [{ kind: 'any' }], purpose: 'read' },
      ],
      riskSelfAssessment: 'low',
    });
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter(badJson), store);

    const manifest = await planner.planFromTasks({
      goal: 'Read and write',
      teamId: 'team-delta',
      teamName: 'Delta',
      tasks: mockTasks,
    });

    // write_file entry filtered (invalid scope), read_file kept
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].tool).toBe('read_file');
  });

  it('filters out entries with no valid scopes', async () => {
    const badJson = JSON.stringify({
      steps: [],
      entries: [
        { tool: 'write_file', scopes: [], purpose: 'write' },
      ],
      riskSelfAssessment: 'low',
    });
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter(badJson), store);

    const manifest = await planner.planFromTasks({
      goal: 'Write files',
      teamId: 'team-epsilon',
      teamName: 'Epsilon',
      tasks: mockTasks,
    });

    expect(manifest.entries).toHaveLength(0);
  });

  it('stores manifest in provided store (findable by teamId)', async () => {
    const store = new ManifestStore();
    const planner = new LeadPlanner(makeRouter(validManifestJson), store);

    const manifest = await planner.planFromTasks({
      goal: 'Build a REST API',
      teamId: 'team-zeta',
      teamName: 'Zeta',
      tasks: mockTasks,
    });

    expect(store.get(manifest.id)).toBe(manifest);
    expect(store.listPending().some(m => m.id === manifest.id)).toBe(true);
  });
});
