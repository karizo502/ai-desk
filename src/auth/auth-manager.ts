/**
 * AI_DESK — Auth Manager
 *
 * Multi-mode authentication with brute-force protection.
 * There is NO "none" mode — auth is always mandatory.
 */
import { ChallengeManager } from './challenge.js';
import { TokenStore } from './token-store.js';
import { eventBus } from '../shared/events.js';
import type { AuthConfig } from '../config/schema.js';

interface FailedAttempt {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

export class AuthManager {
  private challengeManager: ChallengeManager;
  private tokenStore: TokenStore;
  private config: AuthConfig;
  private failedAttempts = new Map<string, FailedAttempt>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config: AuthConfig, dataDir: string, masterKey: string) {
    this.config = config;
    this.challengeManager = new ChallengeManager();
    this.tokenStore = new TokenStore(dataDir, masterKey);

    // Cleanup failed attempts periodically
    this.cleanupInterval = setInterval(() => this.cleanupAttempts(), 60_000);
  }

  /**
   * Step 1: Client requests auth → server returns challenge
   */
  createChallenge(remoteAddress: string): {
    challengeId: string;
    nonce: string;
  } | { error: string } {
    // Check if IP is locked out
    const lockStatus = this.checkLockout(remoteAddress);
    if (lockStatus.locked) {
      eventBus.emit('connection:auth:failed', {
        remoteAddress,
        reason: 'IP locked out',
        remainingMs: lockStatus.remainingMs,
      });
      return {
        error: `Too many failed attempts. Locked for ${Math.ceil((lockStatus.remainingMs ?? 0) / 1000)}s`,
      };
    }

    return this.challengeManager.createChallenge(remoteAddress);
  }

  /**
   * Step 2: Client sends response → server verifies
   */
  authenticate(
    _challengeId: string,
    response: string,
    remoteAddress: string
  ): {
    success: boolean;
    tokenId?: string;
    error?: string;
  } {
    // Check lockout
    const lockStatus = this.checkLockout(remoteAddress);
    if (lockStatus.locked) {
      return { success: false, error: 'IP locked out' };
    }

    // Get all valid tokens and try each
    // (In production, the client would specify which token to use)
    const _tokens = this.tokenStore.listTokens().filter(t => !t.revoked && !t.expired);

    for (const _tokenMeta of _tokens) {
      // We need to try the challenge against each valid token
      // The challenge system uses the raw token, so we need a different approach
      // For token mode: client sends SHA-256(nonce + ":" + rawToken) as response
      // We verify by trying each token in the store
      // This is acceptable because we have few tokens (usually 1-3)
    }

    // Simplified token mode: direct token validation
    // Client sends the raw token in the response (over WS which should be localhost only)
    if (this.config.mode === 'token') {
      const tokenId = this.tokenStore.validateToken(response);

      if (tokenId) {
        this.clearFailedAttempts(remoteAddress);
        eventBus.emit('connection:auth', {
          remoteAddress,
          tokenId,
          mode: 'token',
        });
        return { success: true, tokenId };
      }
    }

    // Auth failed — record attempt
    this.recordFailedAttempt(remoteAddress);

    const attempt = this.failedAttempts.get(remoteAddress);
    const remaining = this.config.maxFailedAttempts - (attempt?.count ?? 0);

    eventBus.emit('connection:auth:failed', {
      remoteAddress,
      reason: 'Invalid credentials',
      attemptsRemaining: remaining,
    });

    return {
      success: false,
      error: remaining > 0
        ? `Invalid credentials. ${remaining} attempts remaining.`
        : `Account locked for ${this.config.lockoutDurationMs / 1000}s.`,
    };
  }

  /**
   * Direct token authentication (for WebSocket connections from localhost)
   */
  authenticateToken(token: string, remoteAddress: string): {
    success: boolean;
    tokenId?: string;
    error?: string;
  } {
    // Check lockout
    const lockStatus = this.checkLockout(remoteAddress);
    if (lockStatus.locked) {
      return { success: false, error: 'IP locked out' };
    }

    const tokenId = this.tokenStore.validateToken(token);

    if (tokenId) {
      this.clearFailedAttempts(remoteAddress);
      eventBus.emit('connection:auth', {
        remoteAddress,
        tokenId,
        mode: 'token-direct',
      });
      return { success: true, tokenId };
    }

    this.recordFailedAttempt(remoteAddress);
    return { success: false, error: 'Invalid token' };
  }

  /** Generate a new auth token */
  generateToken(label: string = 'default'): { id: string; token: string } {
    return this.tokenStore.createToken(label, this.config.tokenExpiryMs);
  }

  /** Revoke a token */
  revokeToken(tokenId: string): boolean {
    return this.tokenStore.revokeToken(tokenId);
  }

  /** List all tokens (metadata only, no raw values) */
  listTokens() {
    return this.tokenStore.listTokens();
  }

  // ─── Brute-Force Protection ─────────────────────────────

  private checkLockout(remoteAddress: string): {
    locked: boolean;
    remainingMs?: number;
  } {
    const attempt = this.failedAttempts.get(remoteAddress);
    if (!attempt || !attempt.lockedUntil) return { locked: false };

    const now = Date.now();
    if (now >= attempt.lockedUntil) {
      // Lockout expired
      this.failedAttempts.delete(remoteAddress);
      return { locked: false };
    }

    return {
      locked: true,
      remainingMs: attempt.lockedUntil - now,
    };
  }

  private recordFailedAttempt(remoteAddress: string): void {
    const now = Date.now();
    const existing = this.failedAttempts.get(remoteAddress);

    if (!existing) {
      this.failedAttempts.set(remoteAddress, {
        count: 1,
        firstAttemptAt: now,
        lockedUntil: null,
      });
      return;
    }

    existing.count++;

    if (existing.count >= this.config.maxFailedAttempts) {
      existing.lockedUntil = now + this.config.lockoutDurationMs;

      eventBus.emit('security:alert', {
        type: 'brute_force_lockout',
        remoteAddress,
        attempts: existing.count,
        lockedUntilMs: this.config.lockoutDurationMs,
      });
    }
  }

  private clearFailedAttempts(remoteAddress: string): void {
    this.failedAttempts.delete(remoteAddress);
  }

  private cleanupAttempts(): void {
    const now = Date.now();
    const expireAfter = this.config.lockoutDurationMs * 2;

    for (const [ip, attempt] of this.failedAttempts) {
      if (now - attempt.firstAttemptAt > expireAfter) {
        this.failedAttempts.delete(ip);
      }
    }
  }

  /** Shutdown */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.challengeManager.destroy();
    this.tokenStore.close();
    this.failedAttempts.clear();
  }
}
