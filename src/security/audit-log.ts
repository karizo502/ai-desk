/**
 * AI_DESK — Tamper-Evident Audit Log
 *
 * Hash-chain audit log: each entry contains a hash of the previous entry.
 * If any entry is tampered with, the chain breaks and is detectable.
 */
import Database from 'better-sqlite3';
import { hashChainEntry, sha256 } from '../shared/crypto.js';
import { eventBus } from '../shared/events.js';
import { v4 as uuid } from 'uuid';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { AuditEntry, GatewayEvent } from '../shared/types.js';

const GENESIS_HASH = sha256('AI_DESK_GENESIS_BLOCK');

export class AuditLog {
  private db: Database.Database;
  private lastHash: string = GENESIS_HASH;
  private insertStmt!: Database.Statement;
  private closed = false;

  constructor(dataDir: string) {
    const dbDir = resolve(dataDir, 'security');
    mkdirSync(dbDir, { recursive: true });

    this.db = new Database(resolve(dbDir, 'audit.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.loadLastHash();
    this.prepareStatements();
    this.subscribeToEvents();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event TEXT NOT NULL,
        actor TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        metadata TEXT,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
    `);
  }

  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, event, actor, target, detail, metadata, previous_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  private loadLastHash(): void {
    const row = this.db.prepare(
      'SELECT hash FROM audit_log ORDER BY timestamp DESC, rowid DESC LIMIT 1'
    ).get() as { hash: string } | undefined;

    this.lastHash = row?.hash ?? GENESIS_HASH;
  }

  /** Subscribe to all gateway events for automatic logging */
  private subscribeToEvents(): void {
    eventBus.on('*', (data) => {
      // Redact sensitive data before logging
      const sanitized = this.redactSensitive(data.data);

      this.append({
        event: data.event,
        actor: (sanitized.actor as string) ?? (sanitized.remoteAddress as string) ?? 'system',
        target: sanitized.target as string | undefined,
        detail: sanitized.reason as string | undefined,
        metadata: sanitized,
      });
    });
  }

  /** Append a new entry to the audit log */
  append(entry: {
    event: GatewayEvent;
    actor: string;
    target?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  }): AuditEntry | null {
    if (this.closed) return null;

    const id = uuid();
    const timestamp = Date.now();

    // Build hash chain data
    const chainData = JSON.stringify({
      id,
      timestamp,
      event: entry.event,
      actor: entry.actor,
      target: entry.target,
    });
    const hash = hashChainEntry(this.lastHash, chainData);

    const auditEntry: AuditEntry = {
      id,
      timestamp,
      event: entry.event,
      actor: entry.actor,
      target: entry.target,
      detail: entry.detail,
      metadata: entry.metadata,
      previousHash: this.lastHash,
      hash,
    };

    this.insertStmt.run(
      id,
      timestamp,
      entry.event,
      entry.actor,
      entry.target ?? null,
      entry.detail ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      this.lastHash,
      hash
    );

    this.lastHash = hash;
    return auditEntry;
  }

  /**
   * Verify the integrity of the audit log chain.
   * Returns true if the entire chain is intact.
   */
  verifyIntegrity(): {
    valid: boolean;
    totalEntries: number;
    brokenAt?: number;
    detail?: string;
  } {
    const rows = this.db.prepare(
      'SELECT id, timestamp, event, actor, target, previous_hash, hash FROM audit_log ORDER BY timestamp ASC, rowid ASC'
    ).all() as Array<{
      id: string;
      timestamp: number;
      event: string;
      actor: string;
      target: string | null;
      previous_hash: string;
      hash: string;
    }>;

    if (rows.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Check previous hash link
      if (row.previous_hash !== expectedPrevHash) {
        return {
          valid: false,
          totalEntries: rows.length,
          brokenAt: i,
          detail: `Entry ${i} (${row.id}): previous_hash mismatch. Expected ${expectedPrevHash.slice(0, 16)}..., got ${row.previous_hash.slice(0, 16)}...`,
        };
      }

      // Recompute hash
      const chainData = JSON.stringify({
        id: row.id,
        timestamp: row.timestamp,
        event: row.event,
        actor: row.actor,
        target: row.target,
      });
      const expectedHash = hashChainEntry(expectedPrevHash, chainData);

      if (row.hash !== expectedHash) {
        return {
          valid: false,
          totalEntries: rows.length,
          brokenAt: i,
          detail: `Entry ${i} (${row.id}): hash mismatch. Entry may have been tampered with.`,
        };
      }

      expectedPrevHash = row.hash;
    }

    return { valid: true, totalEntries: rows.length };
  }

  /** Query recent audit entries */
  recent(limit: number = 50, eventFilter?: GatewayEvent): AuditEntry[] {
    let query = 'SELECT * FROM audit_log';
    const params: unknown[] = [];

    if (eventFilter) {
      query += ' WHERE event = ?';
      params.push(eventFilter);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      timestamp: number;
      event: string;
      actor: string;
      target: string | null;
      detail: string | null;
      metadata: string | null;
      previous_hash: string;
      hash: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      event: r.event as GatewayEvent,
      actor: r.actor,
      target: r.target ?? undefined,
      detail: r.detail ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      previousHash: r.previous_hash,
      hash: r.hash,
    }));
  }

  /** Redact sensitive values from audit metadata */
  private redactSensitive(data: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ['token', 'password', 'secret', 'key', 'apiKey', 'api_key', 'masterKey'];
    const result = { ...data };

    for (const key of Object.keys(result)) {
      if (sensitive.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
        result[key] = '[REDACTED]';
      }
    }

    return result;
  }

  /** Close the database */
  close(): void {
    this.closed = true;
    this.db.close();
  }
}
