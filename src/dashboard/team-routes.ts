/**
 * AI_DESK — Team & Role HTTP Routes
 *
 * Manages the separation between Roles (positions/workflow slots) and
 * Teams (collections of role→agent assignments).
 *
 * Routes:
 *   GET    /dashboard/api/teams                — roles + teams + agents list
 *   POST   /dashboard/api/roles                — create role
 *   PUT    /dashboard/api/roles/:id            — update role
 *   DELETE /dashboard/api/roles/:id            — delete role
 *   POST   /dashboard/api/teams                — create team
 *   PUT    /dashboard/api/teams/:id            — update team
 *   DELETE /dashboard/api/teams/:id            — delete team
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigManager } from './config-manager.js';
import type { RoleConfig, TeamConfig } from '../config/schema.js';

export class TeamRoutes {
  private cfg: ConfigManager;

  constructor(cfg: ConfigManager) {
    this.cfg = cfg;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = req.method?.toUpperCase() ?? 'GET';

    // GET /dashboard/api/teams — full snapshot (roles + teams + agent list)
    if (url === '/dashboard/api/teams' && method === 'GET') {
      const { roles, teams } = this.cfg.readTeams();
      const { list: agents } = this.cfg.readAgents();
      this.json(res, { roles, teams, agents });
      return true;
    }

    // ─── Role CRUD ────────────────────────────────────────────────────────────

    if (url === '/dashboard/api/roles' && method === 'POST') {
      this.withBody(req, body => {
        const data = body as Record<string, unknown>;
        const err  = this.validateRole(data);
        if (err) { this.error(res, 400, err); return; }

        const { roles, teams } = this.cfg.readTeams();
        if (roles.some(r => r.id === data['id'])) {
          this.error(res, 409, `Role id "${data['id']}" already exists`); return;
        }
        roles.push(this.buildRole(data));
        this.cfg.writeRoles(roles);
        this.cfg.writeTeams(teams); // ensure teams key exists
        this.json(res, { ok: true });
      });
      return true;
    }

    // PUT /dashboard/api/roles/:id
    const roleEditMatch = url.match(/^\/dashboard\/api\/roles\/([^/]+)$/);
    if (roleEditMatch && method === 'PUT') {
      const id = decodeURIComponent(roleEditMatch[1]);
      this.withBody(req, body => {
        const data = body as Record<string, unknown>;
        const err  = this.validateRole(data, true);
        if (err) { this.error(res, 400, err); return; }

        const { roles, teams } = this.cfg.readTeams();
        const idx = roles.findIndex(r => r.id === id);
        if (idx === -1) { this.error(res, 404, `Role "${id}" not found`); return; }

        const newRole = this.buildRole(data);

        // If id changed, update all team member references
        if (newRole.id !== id) {
          for (const team of teams) {
            for (const m of team.members) {
              if (m.roleId === id) m.roleId = newRole.id;
            }
            for (const r of roles) {
              if (r.canDelegateTo) {
                r.canDelegateTo = r.canDelegateTo.map(d => d === id ? newRole.id : d);
              }
            }
          }
          this.cfg.writeTeams(teams);
        }

        roles[idx] = newRole;
        this.cfg.writeRoles(roles);
        this.json(res, { ok: true });
      });
      return true;
    }

    // DELETE /dashboard/api/roles/:id
    if (roleEditMatch && method === 'DELETE') {
      const id = decodeURIComponent(roleEditMatch[1]);
      const { roles, teams } = this.cfg.readTeams();
      const idx = roles.findIndex(r => r.id === id);
      if (idx === -1) { this.error(res, 404, `Role "${id}" not found`); return true; }

      // Check if any team uses this role
      const usedIn = teams.filter(t => t.members.some(m => m.roleId === id)).map(t => t.name);
      if (usedIn.length > 0) {
        this.error(res, 409, `Role is used in teams: ${usedIn.join(', ')} — remove from teams first`);
        return true;
      }

      roles.splice(idx, 1);
      this.cfg.writeRoles(roles);
      this.json(res, { ok: true });
      return true;
    }

    // ─── Team CRUD ────────────────────────────────────────────────────────────

    if (url === '/dashboard/api/teams' && method === 'POST') {
      this.withBody(req, body => {
        const data = body as Record<string, unknown>;
        const err  = this.validateTeam(data);
        if (err) { this.error(res, 400, err); return; }

        const { roles, teams } = this.cfg.readTeams();
        if (teams.some(t => t.id === data['id'])) {
          this.error(res, 409, `Team id "${data['id']}" already exists`); return;
        }
        teams.push(this.buildTeam(data));
        this.cfg.writeRoles(roles);
        this.cfg.writeTeams(teams);
        this.json(res, { ok: true });
      });
      return true;
    }

    // PUT /dashboard/api/teams/:id
    const teamEditMatch = url.match(/^\/dashboard\/api\/teams\/([^/]+)$/);
    if (teamEditMatch && method === 'PUT') {
      const id = decodeURIComponent(teamEditMatch[1]);
      this.withBody(req, body => {
        const data = body as Record<string, unknown>;
        const err  = this.validateTeam(data, true);
        if (err) { this.error(res, 400, err); return; }

        const { roles, teams } = this.cfg.readTeams();
        const idx = teams.findIndex(t => t.id === id);
        if (idx === -1) { this.error(res, 404, `Team "${id}" not found`); return; }

        teams[idx] = this.buildTeam(data);
        this.cfg.writeRoles(roles);
        this.cfg.writeTeams(teams);
        this.json(res, { ok: true });
      });
      return true;
    }

    // POST /dashboard/api/teams/:id/run
    const teamRunMatch = url.match(/^\/dashboard\/api\/teams\/([^/]+)\/run$/);
    if (teamRunMatch && method === 'POST') {
      const id = decodeURIComponent(teamRunMatch[1]);
      this.withBody(req, body => void this.handleRunTeam(res, id, body));
      return true;
    }

    // DELETE /dashboard/api/teams/:id
    if (teamEditMatch && method === 'DELETE') {
      const id = decodeURIComponent(teamEditMatch[1]);
      const { roles, teams } = this.cfg.readTeams();
      const idx = teams.findIndex(t => t.id === id);
      if (idx === -1) { this.error(res, 404, `Team "${id}" not found`); return true; }

      teams.splice(idx, 1);
      this.cfg.writeRoles(roles);
      this.cfg.writeTeams(teams);
      this.json(res, { ok: true });
      return true;
    }

    return false;
  }

  // ─── run ─────────────────────────────────────────────────────────────────────

  private async handleRunTeam(res: ServerResponse, teamId: string, body: unknown): Promise<void> {
    const goal = String((body as Record<string, unknown>)['goal'] ?? '').trim();
    if (!goal) { this.error(res, 400, 'goal is required'); return; }

    const { teams } = this.cfg.readTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) { this.error(res, 404, `Team "${teamId}" not found`); return; }

    // Dynamically import TeamCoordinator to avoid circular deps at module load
    try {
      const configPath = this.cfg.path;
      const { loadConfig } = await import('../config/config-loader.js');
      const { config }     = loadConfig(configPath);

      if (!config.teams) {
        this.error(res, 400, 'No teams block in config'); return;
      }

      const { ModelRouter }     = await import('../models/model-router.js');
      const { SessionStore }    = await import('../sessions/session-store.js');
      const { PolicyEngine }    = await import('../tools/policy-engine.js');
      const { SandboxManager }  = await import('../tools/sandbox-interface.js');
      const { ThreatDetector }  = await import('../security/threat-detector.js');
      const { BudgetTracker }   = await import('../budget/budget-tracker.js');
      const { ResponseCache }   = await import('../cache/response-cache.js');
      const { ContextCompactor }= await import('../agents/compactor.js');
      const { ToolRegistry }    = await import('../agents/tool-registry.js');
      const { ToolExecutor }    = await import('../agents/tool-executor.js');
      const { SubagentSpawner } = await import('../agents/subagent-spawner.js');
      const { AgentRuntime }    = await import('../agents/agent-runtime.js');
      const { TeamCoordinator } = await import('../roles/team-coordinator.js');

      const masterKey = process.env.AI_DESK_MASTER_KEY ?? '';
      const dataDir   = process.env.AI_DESK_DATA_DIR   ?? './.ai-desk-data';

      const router    = new ModelRouter(config.agents.defaults.model, config.agents.defaults.subagents.model);
      const sessions  = new SessionStore(dataDir, masterKey);
      const policy    = new PolicyEngine(config.agents.defaults.tools);
      const sandbox   = new SandboxManager(config.agents.defaults.sandbox);
      const threat    = new ThreatDetector();
      const budget    = new BudgetTracker(dataDir, config.agents.defaults.budget);
      const cache     = new ResponseCache(dataDir, masterKey,
        config.cache ?? { enabled: true, backend: 'sqlite', ttlSeconds: 3600 });
      const compactor = new ContextCompactor(router, config.memory ?? {
        backend: 'none',
        compaction: { threshold: 0.6, model: 'anthropic/claude-haiku-3.5' },
      });
      const registry  = new ToolRegistry();
      const executor  = new ToolExecutor({
        policy, registry, sandbox, threat,
        sandboxConfig: config.agents.defaults.sandbox,
        requestApproval: async () => false,
      });
      const subagents = new SubagentSpawner({
        router, executor, budget, compactor, policy,
        defaults: config.agents.defaults.subagents,
      });
      const runtime   = new AgentRuntime({
        router, cache, budget, compactor, executor, subagents, sessions, threat,
        defaults: config.agents.defaults,
        agents:   config.agents.list,
      });

      const coordinator = new TeamCoordinator({
        runtime,
        roles: config.teams.roles,
        teams: config.teams.teams,
      });

      const result = await coordinator.run(teamId, goal);

      // Cleanup
      sessions.close_db();
      budget.close();
      cache.close();

      this.json(res, result);
    } catch (err) {
      this.error(res, 500, (err as Error).message ?? 'Team run failed');
    }
  }

  // ─── builders ────────────────────────────────────────────────────────────────

  private buildRole(d: Record<string, unknown>): RoleConfig {
    const role: RoleConfig = {
      id:          String(d['id']).trim(),
      name:        String(d['name']).trim(),
      description: String(d['description'] ?? '').trim(),
    };
    const resp = d['responsibilities'];
    if (Array.isArray(resp) && resp.length > 0) {
      role.responsibilities = resp.map(String).filter(Boolean);
    }
    const spp = d['systemPromptPrefix'];
    if (typeof spp === 'string' && spp.trim()) role.systemPromptPrefix = spp.trim();
    const cdt = d['canDelegateTo'];
    if (Array.isArray(cdt) && cdt.length > 0) {
      role.canDelegateTo = cdt.map(String).filter(Boolean);
    }
    return role;
  }

  private buildTeam(d: Record<string, unknown>): TeamConfig {
    const members = (Array.isArray(d['members']) ? d['members'] : []) as Array<{ agentId: string; roleId: string }>;
    const team: TeamConfig = {
      id:          String(d['id']).trim(),
      name:        String(d['name']).trim(),
      leadAgentId: String(d['leadAgentId']).trim(),
      members:     members.map(m => ({ agentId: String(m.agentId), roleId: String(m.roleId) })),
    };
    const sg = d['sharedGoal'];
    if (typeof sg === 'string' && sg.trim()) team.sharedGoal = sg.trim();
    return team;
  }

  // ─── validators ──────────────────────────────────────────────────────────────

  private validateRole(d: Record<string, unknown>, isUpdate = false): string | null {
    if (!isUpdate && !String(d['id'] ?? '').trim())   return 'id is required';
    if (!String(d['name'] ?? '').trim())               return 'name is required';
    if (!/^[a-z0-9_-]+$/.test(String(d['id'] ?? ''))) return 'id must be lowercase letters, numbers, - or _';
    return null;
  }

  private validateTeam(d: Record<string, unknown>, isUpdate = false): string | null {
    if (!isUpdate && !String(d['id'] ?? '').trim())       return 'id is required';
    if (!String(d['name'] ?? '').trim())                   return 'name is required';
    if (!String(d['leadAgentId'] ?? '').trim())            return 'leadAgentId is required';
    if (!/^[a-z0-9_-]+$/.test(String(d['id'] ?? '')))    return 'id must be lowercase letters, numbers, - or _';
    return null;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private withBody(req: IncomingMessage, handler: (body: unknown) => void): void {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { handler(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch { handler({}); }
    });
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private error(res: ServerResponse, status: number, message: string): void {
    this.json(res, { error: message }, status);
  }
}
