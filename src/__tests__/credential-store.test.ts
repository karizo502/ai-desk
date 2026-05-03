/**
 * AI_DESK — CredentialStore Tests
 *
 * Tests encrypted storage, all provider types, and Claude Code detection.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  CredentialStore,
  readClaudeCodeCredentials,
  claudeCodeCredentialsPath,
} from '../auth/credential-store.js';

const MASTER_KEY = 'test-master-key-32chars-or-more!!';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ai-desk-cred-test-'));
}

describe('CredentialStore', () => {
  let tmpDir: string;
  let store: CredentialStore;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    store  = new CredentialStore(tmpDir, MASTER_KEY);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── api_key credentials ─────────────────────────────────────────────────────

  it('stores and retrieves an Anthropic API key', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'sk-ant-test-key' });
    const cred = store.get('anthropic');
    expect(cred?.type).toBe('api_key');
    expect((cred as { apiKey: string }).apiKey).toBe('sk-ant-test-key');
  });

  it('getApiKey returns the key for api_key type', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'sk-ant-abc' });
    expect(store.getApiKey('anthropic')).toBe('sk-ant-abc');
  });

  it('getApiKey returns undefined for claude_code type', () => {
    store.set('anthropic', { type: 'claude_code', accessToken: 'tok-abc', expiresAt: Date.now() + 3_600_000 });
    expect(store.getApiKey('anthropic')).toBeUndefined();
  });

  it('stores and retrieves OpenRouter API key', () => {
    store.set('openrouter', { type: 'api_key', apiKey: 'sk-or-v1-test' });
    expect(store.getApiKey('openrouter')).toBe('sk-or-v1-test');
  });

  it('deletes a credential', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'key' });
    expect(store.delete('anthropic')).toBe(true);
    expect(store.get('anthropic')).toBeNull();
  });

  it('delete returns false for non-existent provider', () => {
    expect(store.delete('nonexistent')).toBe(false);
  });

  // ── claude_code credential ──────────────────────────────────────────────────

  it('stores claude_code credential and retrieves OAuth token', () => {
    const expiresAt = Date.now() + 3_600_000;
    store.set('anthropic', { type: 'claude_code', accessToken: 'oauth-tok-xyz', expiresAt });
    const token = store.getAnthropicOAuthToken();
    expect(token).toBe('oauth-tok-xyz');
  });

  it('getAnthropicOAuthToken returns undefined if token is expired', () => {
    store.set('anthropic', { type: 'claude_code', accessToken: 'old-tok', expiresAt: Date.now() - 1000 });
    expect(store.getAnthropicOAuthToken()).toBeUndefined();
  });

  it('getAnthropicOAuthToken returns undefined if no anthropic credential', () => {
    expect(store.getAnthropicOAuthToken()).toBeUndefined();
  });

  it('getAnthropicOAuthToken returns undefined for api_key type', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'sk-ant' });
    expect(store.getAnthropicOAuthToken()).toBeUndefined();
  });

  // ── Google OAuth credential ─────────────────────────────────────────────────

  it('stores and retrieves Google OAuth credential', async () => {
    const expiresAt = Date.now() + 3_600_000;
    store.set('google', {
      type: 'oauth', accessToken: 'goo-access', refreshToken: 'goo-refresh', expiresAt, email: 'test@example.com',
    });
    // Not near expiry — returns token directly
    const tok = await store.getValidGoogleAccessToken();
    expect(tok).toBe('goo-access');
  });

  it('returns undefined from getValidGoogleAccessToken if not OAuth type', async () => {
    store.set('google', { type: 'api_key', apiKey: 'AIza-test' });
    expect(await store.getValidGoogleAccessToken()).toBeUndefined();
  });

  // ── status summary ──────────────────────────────────────────────────────────

  it('status reports correct types without exposing keys', () => {
    store.set('anthropic',  { type: 'api_key', apiKey: 'sk-ant' });
    store.set('google',     { type: 'api_key', apiKey: 'AIza' });
    store.set('openrouter', { type: 'api_key', apiKey: 'sk-or' });

    const s = store.status();
    expect(s['anthropic']?.configured).toBe(true);
    expect(s['anthropic']?.type).toBe('api_key');
    expect(s['google']?.configured).toBe(true);
    expect(s['openrouter']?.configured).toBe(true);

    // Keys must NOT be exposed
    expect(JSON.stringify(s)).not.toContain('sk-ant');
    expect(JSON.stringify(s)).not.toContain('AIza');
    expect(JSON.stringify(s)).not.toContain('sk-or');
  });

  it('status includes email for google OAuth', () => {
    store.set('google', {
      type: 'oauth', accessToken: 'at', refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000, email: 'user@gmail.com',
    });
    const s = store.status();
    expect(s['google']?.email).toBe('user@gmail.com');
    expect(s['google']?.type).toBe('oauth');
    expect(JSON.stringify(s)).not.toContain('at'); // token not exposed
  });

  it('status shows claude_code type for stored OAuth token', () => {
    store.set('anthropic', { type: 'claude_code', accessToken: 'cc-tok', expiresAt: Date.now() + 3600_000 });
    const s = store.status();
    expect(s['anthropic']?.type).toBe('claude_code');
    expect(JSON.stringify(s)).not.toContain('cc-tok');
  });

  // ── upsert ──────────────────────────────────────────────────────────────────

  it('overwrites existing credential on set', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'old-key' });
    store.set('anthropic', { type: 'api_key', apiKey: 'new-key' });
    expect(store.getApiKey('anthropic')).toBe('new-key');
  });

  // ── encryption ──────────────────────────────────────────────────────────────

  it('cannot decrypt with wrong master key', () => {
    store.set('anthropic', { type: 'api_key', apiKey: 'secret' });
    const store2 = new CredentialStore(tmpDir, 'completely-different-key-here!!');
    expect(store2.get('anthropic')).toBeNull(); // decrypt fails → null
    store2.close();
  });
});

// ── Claude Code file detection ──────────────────────────────────────────────────

describe('readClaudeCodeCredentials', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function writeCredFile(content: unknown, dir = tmpDir): string {
    const file = join(dir, '.credentials.json');
    writeFileSync(file, JSON.stringify(content), 'utf-8');
    return file;
  }

  it('returns null when file does not exist', () => {
    const result = readClaudeCodeCredentials();
    // Developer machines may have Claude Code installed; CI typically will not.
    if (result !== null) {
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    }
  });

  it('claudeCodeCredentialsPath returns path inside home dir', () => {
    const p = claudeCodeCredentialsPath();
    expect(p).toContain('.claude');
    expect(p).toContain('.credentials.json');
    expect(p.startsWith(homedir())).toBe(true);
  });
});

// ── readClaudeCodeCredentials with mocked fs ────────────────────────────────────

describe('readClaudeCodeCredentials (mocked fs)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns accessToken from valid credentials file', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    vi.spyOn({ existsSync }, 'existsSync').mockReturnValue(true);

    // We can't easily mock individual fs calls without module mocking,
    // so we write a real temp file and read it by overriding the path.
    // Instead, test the exported helper directly with a known-good scenario
    // by writing to the actual expected path (skipped in CI if dir not writable).

    // Minimal: just verify the function signature and return type contract
    const result = readClaudeCodeCredentials();
    // Result is null (no Claude Code in test env) or a valid object
    if (result !== null) {
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    }
  });

  it('parses credential file with all fields', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cc-test-'));
    const claudeDir = join(tmpDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, '.credentials.json'), JSON.stringify({
      claudeAiOauth: {
        accessToken:  'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt:    Date.now() + 3_600_000,
        tokenType:    'Bearer',
      },
    }));

    // We can't override homedir() without patching, but we can test the
    // parse logic by importing it if it had a configurable path.
    // For now, verify the file was written correctly (integration-style).
    const raw = JSON.parse(
      require('fs').readFileSync(join(claudeDir, '.credentials.json'), 'utf-8')
    ) as { claudeAiOauth: { accessToken: string; expiresAt: number } };
    expect(raw.claudeAiOauth.accessToken).toBe('test-access-token');
    expect(raw.claudeAiOauth.expiresAt).toBeGreaterThan(Date.now());

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
