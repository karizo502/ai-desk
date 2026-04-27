/**
 * AI_DESK — Challenge-Response Authentication
 *
 * Prevents replay attacks with single-use nonces.
 * Each challenge has a short TTL and can only be used once.
 */
import { generateNonce, sha256, safeCompare } from '../shared/crypto.js';

interface PendingChallenge {
  nonce: string;
  createdAt: number;
  expiresAt: number;
  remoteAddress: string;
}

const CHALLENGE_TTL_MS = 30_000; // 30 seconds to respond
const MAX_PENDING = 1000;        // Prevent memory exhaustion

export class ChallengeManager {
  private pending = new Map<string, PendingChallenge>();
  private usedNonces = new Set<string>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Periodic cleanup of expired challenges
    this.cleanupInterval = setInterval(() => this.cleanup(), 10_000);
  }

  /** Generate a new challenge nonce for a connection */
  createChallenge(remoteAddress: string): {
    challengeId: string;
    nonce: string;
  } {
    // Prevent memory exhaustion
    if (this.pending.size >= MAX_PENDING) {
      this.cleanup();
      if (this.pending.size >= MAX_PENDING) {
        throw new Error('Too many pending challenges');
      }
    }

    const nonce = generateNonce(32);
    const challengeId = sha256(nonce).slice(0, 16);
    const now = Date.now();

    this.pending.set(challengeId, {
      nonce,
      createdAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
      remoteAddress,
    });

    return { challengeId, nonce };
  }

  /**
   * Verify a challenge response.
   *
   * Expected response: SHA-256(nonce + ":" + token)
   * This proves the client knows the token without sending it in cleartext.
   */
  verifyResponse(
    challengeId: string,
    response: string,
    token: string,
    remoteAddress: string
  ): { valid: boolean; reason?: string } {
    const challenge = this.pending.get(challengeId);

    if (!challenge) {
      return { valid: false, reason: 'Unknown or expired challenge' };
    }

    // One-time use
    this.pending.delete(challengeId);

    // Check replay
    if (this.usedNonces.has(challenge.nonce)) {
      return { valid: false, reason: 'Nonce already used (replay detected)' };
    }

    // Check expiry
    if (Date.now() > challenge.expiresAt) {
      return { valid: false, reason: 'Challenge expired' };
    }

    // Check IP binding (prevent challenge forwarding)
    if (challenge.remoteAddress !== remoteAddress) {
      return { valid: false, reason: 'IP address mismatch' };
    }

    // Compute expected response
    const expected = sha256(`${challenge.nonce}:${token}`);

    // Timing-safe comparison
    if (!safeCompare(response, expected)) {
      return { valid: false, reason: 'Invalid response' };
    }

    // Mark nonce as used
    this.usedNonces.add(challenge.nonce);

    return { valid: true };
  }

  /** Cleanup expired challenges and old nonces */
  private cleanup(): void {
    const now = Date.now();

    for (const [id, challenge] of this.pending) {
      if (now > challenge.expiresAt) {
        this.pending.delete(id);
      }
    }

    // Keep used nonces for 2x TTL to prevent late replays, then discard
    // In production, this should use a time-windowed bloom filter
    if (this.usedNonces.size > 10_000) {
      this.usedNonces.clear();
    }
  }

  /** Shutdown cleanup */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.pending.clear();
    this.usedNonces.clear();
  }
}
