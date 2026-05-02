/**
 * AI_DESK — Credential HTTP Routes
 *
 * Handles API key entry and Google OAuth 2.0 Device Flow for the dashboard.
 *
 * Routes:
 *   GET  /dashboard/api/credentials/status          — provider status (no secrets)
 *   POST /dashboard/api/credentials/anthropic        — save Anthropic API key
 *   DELETE /dashboard/api/credentials/anthropic      — remove credential
 *   POST /dashboard/api/credentials/google/apikey    — save Google API key
 *   DELETE /dashboard/api/credentials/google         — remove credential
 *   POST /dashboard/api/auth/google/device/start     — start Google OAuth device flow
 *   GET  /dashboard/api/auth/google/device/poll      — poll for device flow completion
 *
 * Google Device Flow: user visits the provided URL on any device, enters the
 * short user_code to approve access. No redirect URL required.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readClaudeCodeCredentials, claudeCodeCredentialsPath,
  readGeminiCliCredentials, geminiCliCredentialsPath,
} from '../auth/credential-store.js';
import type { CredentialStore } from '../auth/credential-store.js';
import type { MessagingManager } from '../messaging/messaging-manager.js';


export class CredentialRoutes {
  private store: CredentialStore;
  private messagingMgr: MessagingManager | null = null;

  constructor(store: CredentialStore, messagingMgr?: MessagingManager) {
    this.store = store;
    this.messagingMgr = messagingMgr ?? null;
  }

  /** Hot-wire a MessagingManager after construction (set when gateway finishes booting) */
  setMessagingManager(mgr: MessagingManager): void {
    this.messagingMgr = mgr;
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url    = (req.url ?? '').split('?')[0];
    const method = req.method?.toUpperCase() ?? 'GET';

    if (url === '/dashboard/api/credentials/status' && method === 'GET') {
      this.handleStatus(res); return true;
    }
    // Anthropic
    if (url === '/dashboard/api/credentials/anthropic' && method === 'POST') {
      this.withBody(req, body => this.handleSetAnthropicKey(res, body)); return true;
    }
    if (url === '/dashboard/api/credentials/anthropic' && method === 'DELETE') {
      this.store.delete('anthropic'); this.json(res, { ok: true }); return true;
    }
    // Anthropic — Claude Code detection
    if (url === '/dashboard/api/credentials/anthropic/claude-code' && method === 'GET') {
      this.handleDetectClaudeCode(res); return true;
    }
    if (url === '/dashboard/api/credentials/anthropic/claude-code' && method === 'POST') {
      this.handleImportClaudeCode(res); return true;
    }
    // Google
    if (url === '/dashboard/api/credentials/google/apikey' && method === 'POST') {
      this.withBody(req, body => this.handleSetGoogleApiKey(res, body)); return true;
    }
    if (url === '/dashboard/api/credentials/google' && method === 'DELETE') {
      this.store.delete('google'); this.json(res, { ok: true }); return true;
    }
    if (url === '/dashboard/api/credentials/google/gemini-cli' && method === 'GET') {
      this.handleDetectGeminiCli(res); return true;
    }
    if (url === '/dashboard/api/credentials/google/gemini-cli' && method === 'POST') {
      void this.handleImportGeminiCli(res); return true;
    }
    // OpenRouter
    if (url === '/dashboard/api/credentials/openrouter' && method === 'POST') {
      this.withBody(req, body => this.handleSetOpenRouterKey(res, body)); return true;
    }
    if (url === '/dashboard/api/credentials/openrouter' && method === 'DELETE') {
      this.store.delete('openrouter'); this.json(res, { ok: true }); return true;
    }
    // Telegram — hot-connect / disconnect
    if (url === '/dashboard/api/messaging/telegram/connect' && method === 'POST') {
      this.withBody(req, body => void this.handleTelegramConnect(res, body)); return true;
    }
    if (url === '/dashboard/api/messaging/telegram/disconnect' && method === 'POST') {
      void this.handleTelegramDisconnect(res); return true;
    }

    return false;
  }

  // ─── handlers ───────────────────────────────────────────────────────────────

  private handleStatus(res: ServerResponse): void {
    const s = this.store.status();
    const geminiCliAvailable = readGeminiCliCredentials() !== null;
    const claudeCodeAvailable = readClaudeCodeCredentials() !== null;

    this.json(res, {
      anthropic: {
        configured:        s['anthropic']?.configured ?? false,
        type:              s['anthropic']?.type ?? null,
        fromEnv:           !!process.env.ANTHROPIC_API_KEY,
        claudeCodeAvailable,
        claudeCodePath:    claudeCodeCredentialsPath(),
      },
      google: {
        configured:     s['google']?.configured ?? false,
        type:           s['google']?.type ?? null,
        email:          s['google']?.email ?? null,
        expiresAt:      s['google']?.expiresAt ?? null,
        fromEnv:           !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY),
        geminiCliAvailable,
        geminiCliPath:     geminiCliCredentialsPath(),
      },
      openrouter: {
        configured: s['openrouter']?.configured ?? false,
        type:       s['openrouter']?.type ?? null,
        fromEnv:    !!process.env.OPENROUTER_API_KEY,
      },
      telegram: {
        configured: s['telegram']?.configured ?? !!process.env.TELEGRAM_BOT_TOKEN,
        fromEnv:    !!process.env.TELEGRAM_BOT_TOKEN,
        running:    this.messagingMgr?.isTelegramRunning() ?? false,
      },
    });
  }

  private handleSetAnthropicKey(res: ServerResponse, body: unknown): void {
    const key = (body as Record<string, unknown>)['key'];
    if (typeof key !== 'string' || !key.trim()) {
      this.error(res, 400, 'key is required'); return;
    }
    this.store.set('anthropic', { type: 'api_key', apiKey: key.trim() });
    this.json(res, { ok: true });
  }

  private handleSetGoogleApiKey(res: ServerResponse, body: unknown): void {
    const key = (body as Record<string, unknown>)['key'];
    if (typeof key !== 'string' || !key.trim()) {
      this.error(res, 400, 'key is required'); return;
    }
    this.store.set('google', { type: 'api_key', apiKey: key.trim() });
    this.json(res, { ok: true });
  }

  /** Detect Claude Code credentials on disk and return availability */
  private handleDetectClaudeCode(res: ServerResponse): void {
    const creds = readClaudeCodeCredentials();
    this.json(res, {
      found:     creds !== null,
      path:      claudeCodeCredentialsPath(),
      expiresAt: creds?.expiresAt ?? null,
    });
  }

  /** Import detected Claude Code credentials into the store */
  private handleImportClaudeCode(res: ServerResponse): void {
    const creds = readClaudeCodeCredentials();
    if (!creds) {
      this.error(res, 404,
        'Claude Code credentials not found or expired. ' +
        'Install Claude Code and run it at least once: https://claude.ai/code'
      );
      return;
    }
    this.store.set('anthropic', { type: 'claude_code', accessToken: creds.accessToken, expiresAt: creds.expiresAt });
    this.json(res, { ok: true, expiresAt: creds.expiresAt });
  }

  /** Save OpenRouter API key */
  private handleSetOpenRouterKey(res: ServerResponse, body: unknown): void {
    const key = (body as Record<string, unknown>)['key'];
    if (typeof key !== 'string' || !key.trim()) {
      this.error(res, 400, 'key is required'); return;
    }
    this.store.set('openrouter', { type: 'api_key', apiKey: key.trim() });
    this.json(res, { ok: true });
  }

  private async handleTelegramConnect(res: ServerResponse, body: unknown): Promise<void> {
    const token = ((body as Record<string, unknown>)['token'] ?? '').toString().trim();
    if (!token) { this.error(res, 400, 'token is required'); return; }

    if (!this.messagingMgr) {
      this.error(res, 503, 'Messaging manager not available'); return;
    }
    try {
      const { botUsername } = await this.messagingMgr.startTelegram(token);
      // Persist token so it survives restart
      this.store.set('telegram', { type: 'api_key', apiKey: token });
      this.json(res, { ok: true, botUsername });
    } catch (err) {
      this.error(res, 400, (err as Error).message ?? 'Connection failed');
    }
  }

  private async handleTelegramDisconnect(res: ServerResponse): Promise<void> {
    if (!this.messagingMgr) {
      this.error(res, 503, 'Messaging manager not available'); return;
    }
    await this.messagingMgr.stopTelegram();
    this.store.delete('telegram');
    this.json(res, { ok: true });
  }

  private handleDetectGeminiCli(res: ServerResponse): void {
    const creds = readGeminiCliCredentials();
    this.json(res, {
      found: creds !== null,
      path:  geminiCliCredentialsPath(),
    });
  }

  private async handleImportGeminiCli(res: ServerResponse): Promise<void> {
    const creds = readGeminiCliCredentials();
    if (!creds?.accessToken) {
      this.error(res, 404,
        'Gemini CLI credentials not found. Install Gemini CLI or Antigravity and sign in first.'
      );
      return;
    }

    const accessToken  = creds.accessToken;
    const expiresAt    = creds.expiresAt ?? Date.now() + 3600_000;
    const refreshToken = creds.refreshToken ?? '';

    // Discover the user's Code Assist project ID via :loadCodeAssist
    let projectId: string | undefined;
    try {
      const loadResp = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloudaicompanionProject: 'default',
          metadata: { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
        }),
      });
      if (loadResp.ok) {
        const data = await loadResp.json() as { cloudaicompanionProject?: string };
        projectId = data.cloudaicompanionProject;
      } else {
        const text = await loadResp.text();
        this.error(res, 502, `Code Assist enrolment failed (HTTP ${loadResp.status}): ${text.slice(0, 200)}`);
        return;
      }
    } catch (err) {
      this.error(res, 502, `Code Assist discovery failed: ${(err as Error).message}`);
      return;
    }

    if (!projectId) {
      this.error(res, 502, 'Code Assist did not return a project ID. Try signing in via Gemini CLI again.');
      return;
    }

    let email: string | undefined;
    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      email = ((await userResp.json()) as { email?: string }).email;
    } catch { /* email is optional */ }

    this.store.set('google', {
      type: 'oauth',
      accessToken,
      refreshToken,
      expiresAt,
      email,
      projectId,
      useCodeAssist: true,
    });

    this.json(res, { ok: true, email, projectId });
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private withBody(req: IncomingMessage, handler: (body: unknown) => void): void {
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
