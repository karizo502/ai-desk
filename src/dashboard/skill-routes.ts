/**
 * AI_DESK — Skill Management HTTP Routes
 *
 * Approval flow and health data for generated skills via the dashboard.
 *
 * Routes:
 *   GET  /dashboard/api/skills              — list all skills (builtin + generated)
 *   GET  /dashboard/api/skills/pending      — list pending-approval skills
 *   GET  /dashboard/api/skills/conflicts    — run conflict check across all pending skills
 *   GET  /dashboard/api/skills/:name        — skill detail
 *   POST /dashboard/api/skills/:name/approve — approve a pending skill
 *   POST /dashboard/api/skills/:name/reject  — reject a pending skill
 *   POST /dashboard/api/skills/:name/archive — archive any skill
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SkillRegistry } from '../skills/skill-registry.js';
import { auditPendingConflicts } from '../skills/skill-conflict.js';

export class SkillRoutes {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = (req.method ?? 'GET').toUpperCase();

    if (url === '/dashboard/api/skills' && method === 'GET') {
      this.handleList(res); return true;
    }

    if (url === '/dashboard/api/skills/pending' && method === 'GET') {
      this.handlePending(res); return true;
    }

    if (url === '/dashboard/api/skills/conflicts' && method === 'GET') {
      this.handleConflicts(res); return true;
    }

    const skillMatch  = url.match(/^\/dashboard\/api\/skills\/([^/]+)$/);
    const actionMatch = url.match(/^\/dashboard\/api\/skills\/([^/]+)\/(approve|reject|archive)$/);

    if (skillMatch && method === 'GET') {
      const name = decodeURIComponent(skillMatch[1]);
      this.handleDetail(res, name); return true;
    }

    if (actionMatch && method === 'POST') {
      const name   = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2] as 'approve' | 'reject' | 'archive';
      this.handleAction(res, name, action); return true;
    }

    return false;
  }

  // ─── handlers ────────────────────────────────────────────────────────────────

  private handleList(res: ServerResponse): void {
    const skills = this.registry.list().map(s => this.toView(s));
    this.json(res, { skills });
  }

  private handlePending(res: ServerResponse): void {
    const skills = this.registry.listPendingApproval().map(s => this.toView(s));
    this.json(res, { skills });
  }

  private handleConflicts(res: ServerResponse): void {
    const pending = this.registry.listPendingApproval().map(s => s.definition);
    const enabled = this.registry.list()
      .filter(s => s.state.enabled)
      .map(s => s.definition);
    const report = auditPendingConflicts(pending, enabled);
    this.json(res, { conflicts: report });
  }

  private handleDetail(res: ServerResponse, name: string): void {
    const skill = this.registry.get(name);
    if (!skill) { this.error(res, 404, `Skill "${name}" not found`); return; }
    this.json(res, this.toView(skill));
  }

  private handleAction(
    res: ServerResponse,
    name: string,
    action: 'approve' | 'reject' | 'archive',
  ): void {
    const skill = this.registry.get(name);
    if (!skill) { this.error(res, 404, `Skill "${name}" not found`); return; }

    let ok = false;
    if (action === 'approve')  ok = this.registry.approve(name);
    if (action === 'reject')   ok = this.registry.reject(name);
    if (action === 'archive')  ok = this.registry.archive(name);

    if (!ok) {
      this.error(res, 400, `Cannot ${action} skill "${name}" in its current state`);
      return;
    }

    const updated = this.registry.get(name);
    this.json(res, { ok: true, skill: updated ? this.toView(updated) : null });
  }

  // ─── view helpers ─────────────────────────────────────────────────────────────

  private toView(loaded: import('../skills/skill.js').LoadedSkill) {
    return {
      name:            loaded.definition.name,
      version:         loaded.definition.version,
      description:     loaded.definition.description,
      tags:            loaded.definition.tags ?? [],
      enabled:         loaded.state.enabled,
      pendingApproval: loaded.state.pendingApproval ?? false,

      provenance:      loaded.definition.provenance ?? 'builtin',
      createdAt:       loaded.definition.createdAt,
      metrics:         loaded.state.metrics,
      systemPromptAddition: loaded.definition.systemPromptAddition,
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────────

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private error(res: ServerResponse, status: number, message: string): void {
    this.json(res, { error: message }, status);
  }
}
