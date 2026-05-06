/**
 * AI_DESK — PII Scrubber
 *
 * Removes sensitive data from text before it is fed to the skill synthesizer.
 * Operates on raw strings and on TracedTurn arrays.
 *
 * Patterns covered:
 *   - Email addresses
 *   - Phone numbers (TH and international)
 *   - API keys (Anthropic sk-ant-..., OpenAI sk-..., AWS AKIA..., GitHub ghp_.../gho_..., generic Bearer)
 *   - Authorization / X-API-Key headers
 *   - JWT tokens (three base64url segments separated by dots)
 *   - IPv4 addresses (private + public)
 *   - Absolute file paths outside the project root
 *   - Credit card numbers (basic Luhn-pattern)
 */
import { resolve, isAbsolute } from 'node:path';
import type { TracedTurn } from '../memory/skill-trace-store.js';

const REDACTED = '[REDACTED]';

// ── Patterns ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

const PHONE_RE =
  /(?:\+66|0)(?:\d[\s\-]?){8,9}\b|(?:\+\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/g;

const API_KEY_RE = new RegExp(
  [
    'sk-ant-[A-Za-z0-9\\-_]{20,}',   // Anthropic
    'sk-[A-Za-z0-9]{32,}',            // OpenAI / generic
    'AKIA[A-Z0-9]{16}',               // AWS access key
    'ghp_[A-Za-z0-9]{36}',            // GitHub personal token
    'gho_[A-Za-z0-9]{36}',            // GitHub OAuth token
    'ghs_[A-Za-z0-9]{36}',            // GitHub server token
  ].join('|'),
  'g',
);

const BEARER_RE = /Bearer\s+[^\s,\n"']+/gi;
const AUTH_HEADER_RE = /(?:Authorization|X-Api-Key|Api-Key)\s*:\s*[^\n]+/gi;

// JWT: three dot-separated base64url segments, middle segment ≥ 20 chars
const JWT_RE = /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_.+/]+=*/g;

const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

// Credit card (basic 13-19 digit, not inside longer numbers)
const CC_RE = /\b(?:\d[\s\-]?){13,19}\b/g;

// Ordered list of patterns applied sequentially
const PATTERNS: RegExp[] = [
  AUTH_HEADER_RE,
  JWT_RE,
  API_KEY_RE,
  BEARER_RE,
  EMAIL_RE,
  PHONE_RE,
  CC_RE,
  IPV4_RE,
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scrub sensitive data from a single string.
 * If `projectRoot` is given, absolute paths outside that root are also redacted.
 */
export function scrub(text: string, projectRoot?: string): string {
  let result = text;

  for (const re of PATTERNS) {
    re.lastIndex = 0;
    result = result.replace(re, REDACTED);
  }

  if (projectRoot) {
    result = scrubPaths(result, resolve(projectRoot));
  }

  return result;
}

/**
 * Returns true if the text contains patterns that look sensitive.
 * Useful for dry-run warnings without modifying the text.
 */
export function hasSensitiveContent(text: string): boolean {
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Scrub an array of TracedTurns in-place (returns new array, does not mutate).
 * Scrubs: content, toolOutput, and string values inside toolInput.
 */
export function scrubTrace(turns: TracedTurn[], projectRoot?: string): TracedTurn[] {
  return turns.map(turn => ({
    ...turn,
    content: scrub(turn.content, projectRoot),
    toolOutput: turn.toolOutput ? scrub(turn.toolOutput, projectRoot) : turn.toolOutput,
    toolInput: turn.toolInput ? scrubObject(turn.toolInput, projectRoot) : turn.toolInput,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scrubPaths(text: string, root: string): string {
  // Match Unix and Windows absolute paths
  return text.replace(/(?:[A-Za-z]:\\|\/)[^\s"'`,;)>\]]+/g, (match) => {
    if (!isAbsolute(match)) return match;
    const normalised = resolve(match);
    // Keep paths that are inside the project root
    if (normalised.startsWith(root)) return match;
    return REDACTED;
  });
}

function scrubObject(
  obj: Record<string, unknown>,
  projectRoot?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = scrub(value, projectRoot);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, unknown>, projectRoot);
    } else {
      result[key] = value;
    }
  }
  return result;
}
