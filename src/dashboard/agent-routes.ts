/**
 * AI_DESK — Agent Management HTTP Routes
 *
 * Full CRUD for agents and global defaults via the dashboard.
 * All writes go directly to ai-desk.json and optionally trigger
 * a live runtime reload (no restart needed).
 *
 * Routes:
 *   GET    /dashboard/api/agents            — list agents + defaults
 *   PUT    /dashboard/api/agents/defaults   — update global defaults (model/tools/sandbox/budget)
 *   POST   /dashboard/api/agents            — create agent
 *   PUT    /dashboard/api/agents/:id        — update agent
 *   DELETE /dashboard/api/agents/:id        — delete agent
 *   POST   /dashboard/api/agents/:id/default — set as default agent
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigManager } from './config-manager.js';
import type { AgentConfig } from '../config/schema.js';
import type { Static } from '@sinclair/typebox';
import type { AgentDefaultsSchema } from '../config/schema.js';

type AgentDefaults = Static<typeof AgentDefaultsSchema>;

/** Called after every successful write so the gateway can update in-memory state */
export type ReloadFn = (list: AgentConfig[], defaults: Partial<AgentDefaults>) => void;

export class AgentRoutes {
  private cfg: ConfigManager;
  private onReload: ReloadFn | null;

  constructor(cfg: ConfigManager, onReload?: ReloadFn) {
    this.cfg      = cfg;
    this.onReload = onReload ?? null;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = (req.method ?? 'GET').toUpperCase();

    // list / read
    if (url === '/dashboard/api/agents' && method === 'GET') {
      this.handleList(res); return true;
    }
    // update defaults
    if (url === '/dashboard/api/agents/defaults' && method === 'PUT') {
      this.withBody(req, body => this.handlePutDefaults(res, body)); return true;
    }
    // create
    if (url === '/dashboard/api/agents' && method === 'POST') {
      this.withBody(req, body => this.handleCreate(res, body)); return true;
    }

    // per-agent routes: /dashboard/api/agents/:id  and  /dashboard/api/agents/:id/default
    const agentMatch    = url.match(/^\/dashboard\/api\/agents\/([^/]+)$/);
    const defaultMatch  = url.match(/^\/dashboard\/api\/agents\/([^/]+)\/default$/);

    if (agentMatch) {
      const id = decodeURIComponent(agentMatch[1]);
      if (method === 'PUT') {
        this.withBody(req, body => this.handleUpdate(res, id, body)); return true;
      }
      if (method === 'DELETE') {
        this.handleDelete(res, id); return true;
      }
    }
    if (defaultMatch && method === 'POST') {
      const id = decodeURIComponent(defaultMatch[1]);
      this.handleSetDefault(res, id); return true;
    }

    return false;
  }

  // ─── handlers ────────────────────────────────────────────────────────────────

  private handleList(res: ServerResponse): void {
    const { defaults, list } = this.cfg.readAgents();
    this.json(res, { defaults, list });
  }

  private handlePutDefaults(res: ServerResponse, body: unknown): void {
    const patch = body as Partial<AgentDefaults>;
    if (!patch || typeof patch !== 'object') {
      this.error(res, 400, 'Body must be a JSON object'); return;
    }
    this.cfg.writeAgentDefaults(patch);
    const updated = this.cfg.readAgents();
    this.onReload?.(updated.list, updated.defaults);
    this.json(res, { ok: true, defaults: updated.defaults });
  }

  private handleCreate(res: ServerResponse, body: unknown): void {
    const data = body as Partial<AgentConfig> & { id?: string };
    const id   = (data.id ?? '').trim();
    if (!id) { this.error(res, 400, 'id is required'); return; }
    if (!/^[a-z0-9_-]+$/i.test(id)) {
      this.error(res, 400, 'id must be alphanumeric (a-z, 0-9, -, _)'); return;
    }

    const { list } = this.cfg.readAgents();
    if (list.some(a => a.id === id)) {
      this.error(res, 409, `Agent "${id}" already exists`); return;
    }

    const agent = buildAgentConfig(data);
    const newList = [...list, agent];
    // If this is the first agent, make it default
    if (newList.length === 1) newList[0].default = true;

    this.cfg.writeAgentList(newList);
    const updated = this.cfg.readAgents();
    this.onReload?.(updated.list, updated.defaults);
    this.json(res, { ok: true, agent });
  }

  private handleUpdate(res: ServerResponse, id: string, body: unknown): void {
    const data = body as Partial<AgentConfig>;
    const { list } = this.cfg.readAgents();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) { this.error(res, 404, `Agent "${id}" not found`); return; }

    const updated = { ...list[idx], ...buildAgentConfig({ ...data, id }) };
    const newList = [...list];
    newList[idx] = updated;

    this.cfg.writeAgentList(newList);
    const reloaded = this.cfg.readAgents();
    this.onReload?.(reloaded.list, reloaded.defaults);
    this.json(res, { ok: true, agent: updated });
  }

  private handleDelete(res: ServerResponse, id: string): void {
    const { list, defaults } = this.cfg.readAgents();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) { this.error(res, 404, `Agent "${id}" not found`); return; }
    if (list.length === 1) {
      this.error(res, 400, 'Cannot delete the last agent'); return;
    }

    const newList = list.filter(a => a.id !== id);
    // If we deleted the default agent, promote the first remaining one
    const wasDefault = list[idx].default;
    if (wasDefault) newList[0].default = true;

    this.cfg.writeAgentList(newList);
    this.onReload?.(newList, defaults);
    this.json(res, { ok: true });
  }

  private handleSetDefault(res: ServerResponse, id: string): void {
    const { list, defaults } = this.cfg.readAgents();
    if (!list.some(a => a.id === id)) {
      this.error(res, 404, `Agent "${id}" not found`); return;
    }
    const newList = list.map(a => ({ ...a, default: a.id === id ? true : undefined }));
    this.cfg.writeAgentList(newList);
    this.onReload?.(newList, defaults);
    this.json(res, { ok: true });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private withBody(req: IncomingMessage, handler: (b: unknown) => void): void {
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

// ─── build helpers ────────────────────────────────────────────────────────────

function buildAgentConfig(data: Partial<AgentConfig> & { id?: string }): AgentConfig {
  const agent: AgentConfig = {
    id:        (data.id ?? '').trim(),
    workspace: (data.workspace ?? '.').trim() || '.',
  };

  if (data.default) agent.default = true;

  if (data.model?.primary) {
    agent.model = { primary: data.model.primary };
    if (data.model.failover?.length) agent.model.failover   = data.model.failover;
    if (data.model.compaction)       agent.model.compaction = data.model.compaction;
  }

  if (data.tools?.profile) {
    agent.tools = { profile: data.tools.profile, ...( data.tools.allow ? { allow: data.tools.allow } : {} ) };
  }

  if (data.sandbox?.mode) {
    agent.sandbox = {
      mode:          data.sandbox.mode,
      timeoutMs:     data.sandbox.timeoutMs     ?? 30000,
      maxMemoryMb:   data.sandbox.maxMemoryMb   ?? 512,
      networkAccess: data.sandbox.networkAccess ?? false,
    };
  }

  return agent;
}
