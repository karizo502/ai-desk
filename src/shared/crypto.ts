/**
 * AI_DESK — Crypto Utilities
 *
 * AES-256-GCM encryption for all secrets at rest.
 * Secure random generation for tokens, nonces, challenges.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // GCM recommended IV length
const TAG_LENGTH = 16;   // Auth tag length
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;   // 256 bits

/** Derive a 256-bit key from a passphrase using scrypt */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: 16384,  // CPU/memory cost parameter
    r: 8,      // Block size
    p: 1,      // Parallelism
  });
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns: salt(32) + iv(12) + tag(16) + ciphertext
 */
export function encrypt(plaintext: string, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // salt + iv + tag + ciphertext
  return Buffer.concat([salt, iv, tag, encrypted]);
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Input format: salt(32) + iv(12) + tag(16) + ciphertext
 */
export function decrypt(encryptedData: Buffer, passphrase: string): string {
  if (encryptedData.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted data is too short to be valid');
  }

  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

/** Generate a cryptographically secure random token (hex) */
export function generateToken(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/** Generate a random nonce (base64url) */
export function generateNonce(byteLength: number = 16): string {
  return randomBytes(byteLength).toString('base64url');
}

/** SHA-256 hash (hex) */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Timing-safe string comparison (prevents timing attacks) */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/** Hash a chain entry for tamper-evident audit log */
export function hashChainEntry(previousHash: string, data: string): string {
  return sha256(`${previousHash}:${data}`);
}
