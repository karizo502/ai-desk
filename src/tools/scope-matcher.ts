/**
 * AI_DESK — Scope Matcher
 *
 * Evaluates whether a tool call falls within a ScopeRule from a permission manifest.
 * Each tool category has a different matching strategy.
 */
import type { ScopeRule } from '../shared/types.js';

/** Built-in command classes mapped to regex patterns */
const COMMAND_CLASS_PATTERNS: Record<string, RegExp> = {
  build:         /^(npm|yarn|pnpm|node|tsc|esbuild|vite|vitest|jest|tsx|rollup|webpack)\b/,
  'vcs-readonly': /^git\s+(status|log|diff|show|branch|fetch|ls-files|rev-parse|describe)\b/,
  'vcs-write':   /^git\s+(add|commit|stash|merge|rebase|cherry-pick|tag|push)\b/,
  destructive:   /^(rm|rmdir|del|rd|mv|move|dd|chmod\s+-[rR]|chown|sudo|curl.+\|\s*(ba)?sh|wget.+\|\s*(ba)?sh)\b/,
};

/**
 * Matches a glob pattern against a path string.
 * Supports * (single segment) and ** (any depth).
 */
export function matchGlob(pattern: string, value: string): boolean {
  // Normalise separators
  const p = pattern.replace(/\\/g, '/');
  const v = value.replace(/\\/g, '/');

  // Split on ** first so single-* replacement never touches the ** tokens.
  // Each segment between ** markers is escaped, then single * and ? are converted.
  const convertSegment = (seg: string) =>
    seg
      .replace(/[.+^${}()|[\]]/g, '\\$&') // escape regex special chars
      .replace(/\*/g, '[^/]*')              // * = single path segment
      .replace(/\?/g, '[^/]');              // ? = single char

  const regex = '^' + p.split('**').map(convertSegment).join('.*') + '$';
  return new RegExp(regex, 'i').test(v);
}

/**
 * Matches a domain pattern against a hostname.
 * Supports leading wildcard: *.example.com matches sub.example.com.
 */
export function matchDomain(pattern: string, hostname: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.example.com'
    return hostname === pattern.slice(2) || hostname.endsWith(suffix);
  }
  return hostname === pattern;
}

/**
 * Extracts the hostname from a URL string.
 * Returns empty string if not parseable.
 */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Tests whether a shell command string falls into a built-in or custom command class.
 */
export function matchCommandClass(
  cls: string,
  customCommands: string[] | undefined,
  command: string,
): boolean {
  const cmd = command.trim();
  if (cls === 'custom' && customCommands) {
    return customCommands.some(c => cmd.startsWith(c));
  }
  const pattern = COMMAND_CLASS_PATTERNS[cls];
  return pattern ? pattern.test(cmd) : false;
}

/**
 * Evaluates a single ScopeRule against the given tool call input.
 *
 * The input shape depends on the tool:
 *   - file tools:    { path: string }
 *   - network tools: { url: string } or { hostname: string }
 *   - shell tools:   { command: string }
 *   - read tools:    (any — kind:'any' always passes)
 */
export function matchScope(rule: ScopeRule, input: Record<string, unknown>): boolean {
  switch (rule.kind) {
    case 'any':
      return true;

    case 'path': {
      const path = typeof input['path'] === 'string' ? input['path']
                 : typeof input['file'] === 'string' ? input['file']
                 : typeof input['target'] === 'string' ? input['target']
                 : null;
      if (!path) return false;
      return matchGlob(rule.glob, path);
    }

    case 'domain': {
      const raw = typeof input['url'] === 'string' ? input['url']
                : typeof input['hostname'] === 'string' ? input['hostname']
                : null;
      if (!raw) return false;
      const hostname = raw.startsWith('http') ? extractHostname(raw) : raw;
      return matchDomain(rule.pattern, hostname);
    }

    case 'command-class': {
      const command = typeof input['command'] === 'string' ? input['command']
                    : typeof input['cmd'] === 'string' ? input['cmd']
                    : null;
      if (!command) return false;
      return matchCommandClass(rule.class, rule.commands, command);
    }
  }
}

/**
 * Returns true if ANY scope rule in the list matches the input.
 * An empty scopes array matches nothing (fail-closed).
 */
export function matchAnyScope(scopes: ScopeRule[], input: Record<string, unknown>): boolean {
  return scopes.some(rule => matchScope(rule, input));
}
