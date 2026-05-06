import { describe, it, expect } from 'vitest';
import { detectConflicts, auditPendingConflicts } from '../skills/skill-conflict.js';

// Helper to make minimal skill stubs
function skill(name: string, systemPromptAddition: string, tags: string[] = []) {
  return { name, systemPromptAddition, tags };
}

describe('detectConflicts — no conflict', () => {
  it('returns none for unrelated skills', () => {
    const candidate = skill('sql-expert', 'Always use parameterised queries for database access.');
    const existing  = [skill('markdown-formatter', 'Format all output as GitHub-flavoured markdown.')];
    const report = detectConflicts(candidate, existing);
    expect(report.severity).toBe('none');
  });

  it('returns none when enabled list is empty', () => {
    const candidate = skill('test-skill', 'Always write unit tests.');
    const report = detectConflicts(candidate, []);
    expect(report.severity).toBe('none');
  });

  it('skips self-comparison', () => {
    const candidate = skill('test-skill', 'Always write unit tests for new code always use coverage.');
    const existing  = [candidate]; // same name = skip
    const report = detectConflicts(candidate, existing);
    expect(report.severity).toBe('none');
  });
});

describe('detectConflicts — topic overlap', () => {
  it('warns on moderate topic overlap', () => {
    const candidate = skill(
      'new-test-skill',
      'Write unit tests for every function and ensure coverage report passes.',
    );
    const existing = [skill(
      'old-test-skill',
      'Write unit tests for every function and check coverage metrics.',
    )];
    const report = detectConflicts(candidate, existing);
    // High overlap — should be warn or block
    expect(['warn', 'block']).toContain(report.severity);
    expect(report.conflictingSkill).toBe('old-test-skill');
  });

  it('blocks on very high topic overlap', () => {
    // Identical prompt text → Jaccard = 1.0
    const text = 'Write unit tests for every function and verify coverage report passes with assertions.';
    const candidate = skill('skill-a', text);
    const existing  = [skill('skill-b', text)];
    const report = detectConflicts(candidate, existing);
    expect(report.severity).toBe('block');
    expect(report.conflictingSkill).toBe('skill-b');
    expect(report.explanation).toMatch(/overlap/i);
  });
});

describe('detectConflicts — contradicting imperatives', () => {
  it('blocks when always/never contradict', () => {
    const candidate = skill('style-a', 'Always enable strict mode.');
    const existing  = [skill('style-b', 'Never enable strict mode.')];
    const report = detectConflicts(candidate, existing);
    expect(report.severity).toBe('block');
    expect(report.conflictingSkill).toBe('style-b');
    expect(report.explanation).toMatch(/contradict/i);
  });

  it('does not flag same-polarity imperatives', () => {
    const candidate = skill('skill-a', 'Always run unit tests before committing.');
    const existing  = [skill('skill-b', 'Always format output as markdown.')];
    // Both say "always" on completely different objects — no contradiction
    const report = detectConflicts(candidate, existing);
    expect(report.explanation ?? '').not.toMatch(/contradict/i);
  });
});

describe('auditPendingConflicts', () => {
  it('returns one report per pending skill', () => {
    const pending = [
      skill('skill-a', 'Always validate user input before processing'),
      skill('skill-b', 'Generate database migrations automatically'),
    ];
    const enabled = [
      skill('skill-c', 'Generate database migrations for schema changes automatically'),
    ];
    const reports = auditPendingConflicts(pending, enabled);
    expect(reports).toHaveLength(2);
    expect(reports[0].skillName).toBe('skill-a');
    expect(reports[1].skillName).toBe('skill-b');
    // skill-b overlaps with skill-c on database/migrations
    expect(['warn', 'block']).toContain(reports[1].severity);
  });

  it('returns severity none for clean pending skills', () => {
    const pending = [skill('skill-x', 'Summarise pull request descriptions concisely.')];
    const enabled = [skill('skill-y', 'Enforce conventional commit message format.')];
    const reports = auditPendingConflicts(pending, enabled);
    expect(reports[0].severity).toBe('none');
  });
});
