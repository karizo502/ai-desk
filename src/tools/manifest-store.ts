/**
 * AI_DESK — Manifest Store
 *
 * In-memory store for pre-flight permission manifests.
 * Manifests are created by the lead agent before team execution,
 * approved by the user, then consumed during tool calls.
 */
import { randomUUID } from 'node:crypto';
import { eventBus } from '../shared/events.js';
import type { ToolManifest, ManifestEntry } from '../shared/types.js';
import { matchAnyScope } from './scope-matcher.js';

export type { ToolManifest, ManifestEntry };

const DEFAULT_TTL_MS = 3_600_000; // 1 hour

export class ManifestStore {
  private manifests = new Map<string, ToolManifest>();

  /** Create a new pending manifest. Returns the manifest id. */
  create(params: {
    taskId: string;
    teamId: string;
    sessionId: string;
    goal: string;
    steps: { title: string; intent: string }[];
    entries: ManifestEntry[];
    riskSelfAssessment: 'low' | 'medium' | 'high';
    rememberForSession?: boolean;
  }): ToolManifest {
    const manifest: ToolManifest = {
      id: randomUUID(),
      status: 'pending',
      createdAt: Date.now(),
      rememberForSession: params.rememberForSession ?? false,
      ...params,
    };
    this.manifests.set(manifest.id, manifest);
    eventBus.emit('manifest:created', {
      manifestId: manifest.id,
      taskId: manifest.taskId,
      teamId: manifest.teamId,
      sessionId: manifest.sessionId,
      riskSelfAssessment: manifest.riskSelfAssessment,
    });
    return manifest;
  }

  /** Approve a manifest. Starts the TTL clock. */
  approve(id: string, approvedBy: string, ttlMs = DEFAULT_TTL_MS): boolean {
    const m = this.manifests.get(id);
    if (!m || m.status !== 'pending') return false;
    m.status = 'approved';
    m.approvedAt = Date.now();
    m.approvedBy = approvedBy;
    m.expiresAt = Date.now() + ttlMs;
    eventBus.emit('manifest:approved', {
      manifestId: id,
      teamId: m.teamId,
      sessionId: m.sessionId,
      approvedBy,
      expiresAt: m.expiresAt,
    });
    return true;
  }

  /** Reject a manifest. */
  reject(id: string, rejectedBy: string): boolean {
    const m = this.manifests.get(id);
    if (!m || m.status !== 'pending') return false;
    m.status = 'rejected';
    eventBus.emit('manifest:rejected', {
      manifestId: id,
      teamId: m.teamId,
      sessionId: m.sessionId,
      rejectedBy,
    });
    return true;
  }

  /** Get a manifest by id. */
  get(id: string): ToolManifest | undefined {
    return this.manifests.get(id);
  }

  /**
   * Get the active (approved, non-expired) manifest for a session.
   * Marks expired manifests automatically.
   */
  getActive(sessionId: string): ToolManifest | undefined {
    for (const m of this.manifests.values()) {
      if (m.sessionId !== sessionId || m.status !== 'approved') continue;
      if (m.expiresAt && Date.now() > m.expiresAt) {
        m.status = 'expired';
        eventBus.emit('manifest:expired', { manifestId: m.id, sessionId });
        continue;
      }
      return m;
    }
    return undefined;
  }

  /**
   * Check if a tool call is covered by the session&apos;s active manifest.
   * Returns the matching ManifestEntry, or null if not covered.
   *
   * Fail-closed: if no active manifest exists, returns null.
   */
  matchCall(
    toolName: string,
    input: Record<string, unknown>,
    sessionId: string,
  ): ManifestEntry | null {
    const manifest = this.getActive(sessionId);
    if (!manifest) return null;

    const entry = manifest.entries.find(
      e => e.tool === toolName && matchAnyScope(e.scopes, input),
    );
    return entry ?? null;
  }

  /** Return all manifests for a session (any status). */
  listBySession(sessionId: string): ToolManifest[] {
    return [...this.manifests.values()].filter(m => m.sessionId === sessionId);
  }

  /** Return all pending manifests (awaiting user approval). */
  listPending(): ToolManifest[] {
    return [...this.manifests.values()].filter(m => m.status === 'pending');
  }

  /** Evict expired/consumed/rejected manifests older than maxAgeMs. */
  evictStale(maxAgeMs = 86_400_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, m] of this.manifests) {
      if (m.status !== 'approved' && m.status !== 'pending' && m.createdAt < cutoff) {
        this.manifests.delete(id);
      }
    }
  }
}

/** Singleton manifest store */
export const manifestStore = new ManifestStore();
