/**
 * AI_DESK — Response Cache
 *
 * Cache identical model calls to save tokens. SQLite backed.
 * Cache key = sha256(model + systemPrompt + canonical(messages) + canonical(tools)).
 *
 * Sensitive: cached responses are encrypted at rest (cache may contain user data).
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { encrypt, decrypt, sha256 } from '../shared/crypto.js';
import { eventBus } from '../shared/events.js';
import type { ModelCallOptions, ModelCallResult } from '../models/provider.js';
import type { CacheConfig } from '../config/schema.js';

interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  totalTokensSaved: number;
  totalCostSaved: number;
}

export class ResponseCache {
  private db: Database.Database;
  private masterKey: string;
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;
  private tokensSaved = 0;
  private costSaved = 0;

  constructor(dataDir: string, masterKey: string, config: CacheConfig) {
    this.masterKey = masterKey;
    this.config = config;

    const dbDir = resolve(dataDir, 'cache');
    mkdirSync(dbDir, { recursive: true });

    this.db = new Database(resolve(dbDir, 'response-cache.db'));
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        encrypted_result BLOB NOT NULL,
        model TEXT NOT NULL,
        tokens_saved INTEGER NOT NULL,
        cost_saved REAL NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0,
        last_hit_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
    `);
  }

  /** Compute deterministic cache key from a model call */
  private computeKey(options: ModelCallOptions): string {
    const canonical = JSON.stringify({
      model: options.model,
      systemPrompt: options.systemPrompt ?? '',
      maxTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      messages: options.messages,
      tools: options.tools ?? [],
    });
    return sha256(canonical);
  }

  /** Look up cached response. Returns null on miss/expired. */
  get(options: ModelCallOptions): ModelCallResult | null {
    if (!this.config.enabled) return null;

    const key = this.computeKey(options);
    const row = this.db.prepare(
      'SELECT encrypted_result, expires_at, tokens_saved, cost_saved FROM cache WHERE key = ?'
    ).get(key) as { encrypted_result: Buffer; expires_at: number; tokens_saved: number; cost_saved: number } | undefined;

    if (!row) {
      this.misses++;
      return null;
    }

    if (Date.now() > row.expires_at) {
      // Expired — clean up and treat as miss
      this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
      this.misses++;
      return null;
    }

    let result: ModelCallResult;
    try {
      const decrypted = decrypt(row.encrypted_result, this.masterKey);
      result = JSON.parse(decrypted);
    } catch {
      // Corrupted entry — drop and miss
      this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
      this.misses++;
      return null;
    }

    this.db.prepare(`
      UPDATE cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE key = ?
    `).run(Date.now(), key);

    this.hits++;
    this.tokensSaved += row.tokens_saved;
    this.costSaved += row.cost_saved;

    eventBus.emit('agent:end', {
      cacheHit: true,
      tokensSaved: row.tokens_saved,
      costSaved: row.cost_saved,
    });

    return { ...result, durationMs: 0 };
  }

  /** Store a model response. No-op if cache disabled or response had tool calls. */
  set(options: ModelCallOptions, result: ModelCallResult): void {
    if (!this.config.enabled) return;
    // Don't cache tool-use turns: tool results would be re-played without re-execution.
    if (result.toolCalls.length > 0) return;
    // Don't cache truncated turns (partial responses).
    if (result.stopReason === 'max_tokens') return;

    const key = this.computeKey(options);
    const encrypted = encrypt(JSON.stringify(result), this.masterKey);

    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO cache
        (key, encrypted_result, model, tokens_saved, cost_saved, created_at, expires_at, hit_count, last_hit_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `).run(
      key,
      encrypted,
      result.model,
      result.usage.totalTokens,
      result.usage.estimatedCost,
      now,
      now + this.config.ttlSeconds * 1000,
    );
  }

  /** Purge expired entries. Returns count removed. */
  purgeExpired(): number {
    const r = this.db.prepare('DELETE FROM cache WHERE expires_at < ?').run(Date.now());
    return r.changes;
  }

  /** Cache stats for `cache stats` CLI */
  stats(): CacheStats {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM cache').get() as { n: number };
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      entries: row.n,
      hitRate: total > 0 ? this.hits / total : 0,
      totalTokensSaved: this.tokensSaved,
      totalCostSaved: this.costSaved,
    };
  }

  /** Wipe entire cache (admin) */
  clear(): number {
    const r = this.db.prepare('DELETE FROM cache').run();
    this.hits = 0;
    this.misses = 0;
    this.tokensSaved = 0;
    this.costSaved = 0;
    return r.changes;
  }

  close(): void {
    this.db.close();
  }
}
