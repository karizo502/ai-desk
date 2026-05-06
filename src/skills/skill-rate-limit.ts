/**
 * AI_DESK — Skill Synthesis Rate Limiter
 *
 * Prevents synthesis runaway:
 *   - max N syntheses per day (resets at UTC midnight)
 *   - minimum gap between consecutive syntheses
 *
 * Stored at: <dataDir>/memory/skill-synth-rate.db
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { eventBus } from '../shared/events.js';
import type { SkillSynthesisConfig } from '../config/schema.js';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  /** When the block lifts (Unix ms). Present when allowed=false. */
  resetAt?: number;
  usedToday: number;
  maxPerDay: number;
}

const DEFAULT_CONFIG: Pick<SkillSynthesisConfig, 'maxPerDay' | 'minGapMinutes'> = {
  maxPerDay: 5,
  minGapMinutes: 15,
};

export class SkillRateLimiter {
  private db: Database.Database;
  private maxPerDay: number;
  private minGapMs: number;

  constructor(dataDir: string, config?: Partial<Pick<SkillSynthesisConfig, 'maxPerDay' | 'minGapMinutes'>>) {
    const dir = resolve(dataDir, 'memory');
    mkdirSync(dir, { recursive: true });

    this.db = new Database(resolve(dir, 'skill-synth-rate.db'));
    this.db.pragma('journal_mode = WAL');
    this.maxPerDay = config?.maxPerDay ?? DEFAULT_CONFIG.maxPerDay;
    this.minGapMs = (config?.minGapMinutes ?? DEFAULT_CONFIG.minGapMinutes) * 60_000;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS synth_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id    TEXT NOT NULL DEFAULT 'global',
        timestamp   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sl_agent_ts ON synth_log(agent_id, timestamp DESC);
    `);
  }

  /**
   * Check if synthesis is allowed. If allowed, records the attempt.
   * If denied, does NOT record.
   */
  checkAndRecord(agentId = 'global'): RateLimitResult {
    const now = Date.now();
    const dayStart = utcMidnight(now);

    // Count today's syntheses
    const usedToday = (this.db.prepare(
      'SELECT COUNT(*) AS c FROM synth_log WHERE agent_id = ? AND timestamp >= ?'
    ).get(agentId, dayStart) as { c: number }).c;

    if (usedToday >= this.maxPerDay) {
      const nextMidnight = dayStart + 86_400_000;
      eventBus.emit('skills:synth:rate-limited', {
        agentId,
        reason: `Daily limit (${this.maxPerDay}) reached`,
        resetAt: nextMidnight,
      });
      return {
        allowed: false,
        reason: `Daily synthesis limit reached (${usedToday}/${this.maxPerDay}). Resets at ${new Date(nextMidnight).toUTCString()}.`,
        resetAt: nextMidnight,
        usedToday,
        maxPerDay: this.maxPerDay,
      };
    }

    // Check minimum gap
    const lastRow = this.db.prepare(
      'SELECT timestamp FROM synth_log WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(agentId) as { timestamp: number } | undefined;

    if (lastRow) {
      const elapsed = now - lastRow.timestamp;
      if (elapsed < this.minGapMs) {
        const resetAt = lastRow.timestamp + this.minGapMs;
        eventBus.emit('skills:synth:rate-limited', {
          agentId,
          reason: `Min gap not elapsed`,
          resetAt,
        });
        const waitSec = Math.ceil((this.minGapMs - elapsed) / 1000);
        return {
          allowed: false,
          reason: `Must wait ${waitSec}s before next synthesis (min gap: ${this.minGapMs / 60_000} min).`,
          resetAt,
          usedToday,
          maxPerDay: this.maxPerDay,
        };
      }
    }

    // Record the attempt
    this.db.prepare('INSERT INTO synth_log (agent_id, timestamp) VALUES (?, ?)').run(agentId, now);

    return { allowed: true, usedToday: usedToday + 1, maxPerDay: this.maxPerDay };
  }

  /** How many syntheses have been used today */
  usedToday(agentId = 'global'): number {
    const dayStart = utcMidnight(Date.now());
    return (this.db.prepare(
      'SELECT COUNT(*) AS c FROM synth_log WHERE agent_id = ? AND timestamp >= ?'
    ).get(agentId, dayStart) as { c: number }).c;
  }

  /** Purge logs older than 2 days (housekeeping) */
  purgeOld(): number {
    const cutoff = Date.now() - 2 * 86_400_000;
    return this.db.prepare('DELETE FROM synth_log WHERE timestamp < ?').run(cutoff).changes;
  }

  close(): void {
    this.db.close();
  }
}

function utcMidnight(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
