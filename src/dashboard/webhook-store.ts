/**
 * AI_DESK — Webhook Store
 *
 * Persists webhook definitions in SQLite.
 * Each webhook has a stable 16-hex ID (URL slug) and a separate HMAC secret.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export interface WebhookDefinition {
  id: string;
  name: string;
  secret: string;
  agentId: string;
  promptTemplate: string;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  triggerCount: number;
}

export class WebhookStore {
  private db: ReturnType<typeof Database>;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = Database(join(dataDir, 'webhooks.db'));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id               TEXT    PRIMARY KEY,
        name             TEXT    NOT NULL,
        secret           TEXT    NOT NULL,
        agent_id         TEXT    NOT NULL,
        prompt_template  TEXT    NOT NULL,
        enabled          INTEGER NOT NULL DEFAULT 1,
        created_at       INTEGER NOT NULL,
        last_triggered_at INTEGER,
        trigger_count    INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  create(input: { name: string; agentId: string; promptTemplate: string }): WebhookDefinition {
    const id     = randomBytes(8).toString('hex');
    const secret = randomBytes(24).toString('hex');
    const now    = Date.now();
    this.db.prepare(`
      INSERT INTO webhooks (id, name, secret, agent_id, prompt_template, enabled, created_at, trigger_count)
      VALUES (?, ?, ?, ?, ?, 1, ?, 0)
    `).run(id, input.name, secret, input.agentId, input.promptTemplate, now);
    return this.get(id)!;
  }

  get(id: string): WebhookDefinition | undefined {
    const row = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toDefinition(row) : undefined;
  }

  list(): WebhookDefinition[] {
    return (this.db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(r => this.toDefinition(r));
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id).changes > 0;
  }

  recordTrigger(id: string): void {
    this.db.prepare(`
      UPDATE webhooks SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?
    `).run(Date.now(), id);
  }

  /** Returns true if the request authenticates correctly against this webhook. */
  verifySecret(id: string, body: string, signature?: string, bearerToken?: string): boolean {
    const wh = this.get(id);
    if (!wh || !wh.enabled) return false;

    // Bearer token: Authorization: Bearer <secret>
    if (bearerToken) {
      try {
        return timingSafeEqual(Buffer.from(bearerToken), Buffer.from(wh.secret));
      } catch { return false; }
    }

    // HMAC-SHA256 signature: X-AI-Desk-Signature: sha256=<hex>
    if (signature && signature.startsWith('sha256=')) {
      const expected = 'sha256=' + createHmac('sha256', wh.secret).update(body).digest('hex');
      try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      } catch { return false; }
    }

    return false;
  }

  close(): void { this.db.close(); }

  private toDefinition(row: Record<string, unknown>): WebhookDefinition {
    return {
      id:               row['id'] as string,
      name:             row['name'] as string,
      secret:           row['secret'] as string,
      agentId:          row['agent_id'] as string,
      promptTemplate:   row['prompt_template'] as string,
      enabled:          Boolean(row['enabled']),
      createdAt:        row['created_at'] as number,
      lastTriggeredAt:  (row['last_triggered_at'] as number | null) ?? null,
      triggerCount:     row['trigger_count'] as number,
    };
  }
}
