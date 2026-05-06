/**
 * AI_DESK — Skill TypeBox Schema
 *
 * Runtime validation for skill definitions loaded from disk.
 * Builtin skills pass a lenient check; generated skills pass a strict check
 * that enforces security invariants (no mcpServer, toolAllowlist subset, etc.).
 */
import { Type, type Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

// ── Sub-schemas ──────────────────────────────────────────────────────────────

const SkillMcpServerSchema = Type.Object({
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  capabilities: Type.Array(Type.String()),
  sandbox: Type.Boolean(),
});

const SkillMetricsSchema = Type.Object({
  uses: Type.Number({ minimum: 0 }),
  successes: Type.Number({ minimum: 0 }),
  failures: Type.Number({ minimum: 0 }),
  lastUsedAt: Type.Optional(Type.Number()),
  avgTokensSaved: Type.Optional(Type.Number()),
  avgLatencyMs: Type.Optional(Type.Number()),
});

// ── Builtin skill schema (lenient — allows mcpServer) ────────────────────────

export const SkillDefinitionSchema = Type.Object({
  name: Type.String({ minLength: 1, pattern: '^[a-z0-9-]+$' }),
  version: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  author: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  mcpServer: Type.Optional(SkillMcpServerSchema),
  systemPromptAddition: Type.Optional(Type.String()),
  toolAllowlist: Type.Optional(Type.Array(Type.String())),
  provenance: Type.Optional(Type.Union([
    Type.Literal('builtin'),
    Type.Literal('generated'),
    Type.Literal('user'),
  ])),
  parentSkill: Type.Optional(Type.String()),
  revision: Type.Optional(Type.Number({ minimum: 1 })),
  sourceSessionId: Type.Optional(Type.String()),
  traceHash: Type.Optional(Type.String()),
  modelId: Type.Optional(Type.String()),
  promptTemplateVersion: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.Number()),
  kind: Type.Optional(Type.Union([Type.Literal('positive'), Type.Literal('avoid')])),
  ttlDays: Type.Optional(Type.Number({ minimum: 1 })),
  scope: Type.Optional(Type.Union([
    Type.Literal('agent'),
    Type.Literal('project'),
    Type.Literal('global'),
  ])),
  allowedAgents: Type.Optional(Type.Array(Type.String())),
});
export type SkillDefinitionStatic = Static<typeof SkillDefinitionSchema>;

/**
 * Strict schema for generated skills — enforces security invariants:
 * - No mcpServer (generated skills cannot spawn external processes)
 * - provenance must be 'generated'
 * - sourceSessionId required
 */
export const GeneratedSkillDefinitionSchema = Type.Object({
  name: Type.String({ minLength: 1, pattern: '^[a-z0-9-]+$' }),
  version: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  author: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  // mcpServer is intentionally absent — generated skills may not spawn servers
  systemPromptAddition: Type.Optional(Type.String()),
  toolAllowlist: Type.Optional(Type.Array(Type.String())),
  provenance: Type.Literal('generated'),
  parentSkill: Type.Optional(Type.String()),
  revision: Type.Number({ minimum: 1 }),
  sourceSessionId: Type.String({ minLength: 1 }),
  traceHash: Type.Optional(Type.String()),
  modelId: Type.Optional(Type.String()),
  promptTemplateVersion: Type.Optional(Type.String()),
  createdAt: Type.Number(),
  kind: Type.Optional(Type.Union([Type.Literal('positive'), Type.Literal('avoid')])),
  ttlDays: Type.Optional(Type.Number({ minimum: 1 })),
  scope: Type.Optional(Type.Union([
    Type.Literal('agent'),
    Type.Literal('project'),
    Type.Literal('global'),
  ])),
  allowedAgents: Type.Optional(Type.Array(Type.String())),
});
export type GeneratedSkillDefinitionStatic = Static<typeof GeneratedSkillDefinitionSchema>;

// ── Compiled validators (fast path) ─────────────────────────────────────────

export const validateSkillDefinition = TypeCompiler.Compile(SkillDefinitionSchema);
export const validateGeneratedSkillDefinition = TypeCompiler.Compile(GeneratedSkillDefinitionSchema);

/** Returns null if valid, or an array of error strings if invalid */
export function checkSkillDefinition(value: unknown): string[] | null {
  if (validateSkillDefinition.Check(value)) return null;
  return [...validateSkillDefinition.Errors(value)].map(e => `${e.path}: ${e.message}`);
}

/** Returns null if valid, or an array of error strings if invalid.
 *  Also rejects any definition that contains an mcpServer field. */
export function checkGeneratedSkillDefinition(value: unknown): string[] | null {
  if (typeof value === 'object' && value !== null && 'mcpServer' in value) {
    return ['Generated skills may not declare mcpServer'];
  }
  if (validateGeneratedSkillDefinition.Check(value)) return null;
  return [...validateGeneratedSkillDefinition.Errors(value)].map(e => `${e.path}: ${e.message}`);
}

export { SkillMetricsSchema };
