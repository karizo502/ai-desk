import { describe, it, expect } from 'vitest';
import { matchGlob, matchDomain, matchCommandClass, matchScope, matchAnyScope } from '../tools/scope-matcher.js';

describe('matchGlob', () => {
  it('matches exact path', () => {
    expect(matchGlob('/workspace/src/index.ts', '/workspace/src/index.ts')).toBe(true);
  });

  it('matches single-segment wildcard', () => {
    expect(matchGlob('/workspace/src/*.ts', '/workspace/src/index.ts')).toBe(true);
    expect(matchGlob('/workspace/src/*.ts', '/workspace/src/sub/index.ts')).toBe(false);
  });

  it('matches double-star wildcard', () => {
    expect(matchGlob('/workspace/**', '/workspace/src/deep/file.ts')).toBe(true);
    expect(matchGlob('/workspace/**/*.ts', '/workspace/src/deep/file.ts')).toBe(true);
    expect(matchGlob('/workspace/**/*.ts', '/other/file.ts')).toBe(false);
  });

  it('does not match outside root', () => {
    expect(matchGlob('/workspace/**', '/etc/passwd')).toBe(false);
  });

  it('normalises backslashes', () => {
    expect(matchGlob('/workspace/**', '\\workspace\\src\\file.ts')).toBe(true);
  });
});

describe('matchDomain', () => {
  it('matches exact domain', () => {
    expect(matchDomain('api.github.com', 'api.github.com')).toBe(true);
    expect(matchDomain('api.github.com', 'evil.com')).toBe(false);
  });

  it('matches wildcard subdomain', () => {
    expect(matchDomain('*.npmjs.org', 'registry.npmjs.org')).toBe(true);
    expect(matchDomain('*.npmjs.org', 'npmjs.org')).toBe(true);
    expect(matchDomain('*.npmjs.org', 'evil.npmjs.org.attacker.com')).toBe(false);
  });

  it('* matches everything', () => {
    expect(matchDomain('*', 'anything.com')).toBe(true);
  });
});

describe('matchCommandClass', () => {
  it('build class matches npm/node/tsc', () => {
    expect(matchCommandClass('build', undefined, 'npm install')).toBe(true);
    expect(matchCommandClass('build', undefined, 'tsc --noEmit')).toBe(true);
    expect(matchCommandClass('build', undefined, 'rm -rf node_modules')).toBe(false);
  });

  it('vcs-readonly matches git status/log/diff', () => {
    expect(matchCommandClass('vcs-readonly', undefined, 'git status')).toBe(true);
    expect(matchCommandClass('vcs-readonly', undefined, 'git log --oneline')).toBe(true);
    expect(matchCommandClass('vcs-readonly', undefined, 'git push')).toBe(false);
  });

  it('vcs-write matches git add/commit/push', () => {
    expect(matchCommandClass('vcs-write', undefined, 'git add .')).toBe(true);
    expect(matchCommandClass('vcs-write', undefined, 'git commit -m "fix"')).toBe(true);
    expect(matchCommandClass('vcs-write', undefined, 'git status')).toBe(false);
  });

  it('destructive matches rm/sudo', () => {
    expect(matchCommandClass('destructive', undefined, 'rm -rf /tmp/build')).toBe(true);
    expect(matchCommandClass('destructive', undefined, 'sudo apt install')).toBe(true);
    expect(matchCommandClass('destructive', undefined, 'npm install')).toBe(false);
  });

  it('custom class uses provided commands prefix', () => {
    expect(matchCommandClass('custom', ['make', 'cmake'], 'make build')).toBe(true);
    expect(matchCommandClass('custom', ['make', 'cmake'], 'cmake ..')).toBe(true);
    expect(matchCommandClass('custom', ['make'], 'npm install')).toBe(false);
  });
});

describe('matchScope', () => {
  it('kind:any always returns true', () => {
    expect(matchScope({ kind: 'any' }, {})).toBe(true);
    expect(matchScope({ kind: 'any' }, { random: 'input' })).toBe(true);
  });

  it('kind:path matches on path/file/target field', () => {
    expect(matchScope({ kind: 'path', glob: '/workspace/**' }, { path: '/workspace/src/a.ts' })).toBe(true);
    expect(matchScope({ kind: 'path', glob: '/workspace/**' }, { file: '/workspace/src/a.ts' })).toBe(true);
    expect(matchScope({ kind: 'path', glob: '/workspace/**' }, { target: '/workspace/src/a.ts' })).toBe(true);
    expect(matchScope({ kind: 'path', glob: '/workspace/**' }, { path: '/etc/passwd' })).toBe(false);
    expect(matchScope({ kind: 'path', glob: '/workspace/**' }, {})).toBe(false);
  });

  it('kind:domain matches on url or hostname field', () => {
    expect(matchScope({ kind: 'domain', pattern: 'api.github.com' }, { url: 'https://api.github.com/repos' })).toBe(true);
    expect(matchScope({ kind: 'domain', pattern: 'api.github.com' }, { hostname: 'api.github.com' })).toBe(true);
    expect(matchScope({ kind: 'domain', pattern: 'api.github.com' }, { url: 'https://evil.com' })).toBe(false);
    expect(matchScope({ kind: 'domain', pattern: 'api.github.com' }, {})).toBe(false);
  });

  it('kind:command-class matches on command or cmd field', () => {
    expect(matchScope({ kind: 'command-class', class: 'build' }, { command: 'npm run build' })).toBe(true);
    expect(matchScope({ kind: 'command-class', class: 'build' }, { cmd: 'node dist/index.js' })).toBe(true);
    expect(matchScope({ kind: 'command-class', class: 'destructive' }, { command: 'npm run build' })).toBe(false);
    expect(matchScope({ kind: 'command-class', class: 'build' }, {})).toBe(false);
  });
});

describe('matchAnyScope', () => {
  it('returns false for empty scopes array (fail-closed)', () => {
    expect(matchAnyScope([], { path: '/workspace/file.ts' })).toBe(false);
  });

  it('returns true if any rule matches', () => {
    expect(matchAnyScope(
      [
        { kind: 'path', glob: '/workspace/**' },
        { kind: 'domain', pattern: 'api.github.com' },
      ],
      { path: '/workspace/file.ts' },
    )).toBe(true);
  });

  it('returns false if no rule matches', () => {
    expect(matchAnyScope(
      [
        { kind: 'path', glob: '/workspace/**' },
        { kind: 'domain', pattern: 'api.github.com' },
      ],
      { path: '/etc/passwd' },
    )).toBe(false);
  });
});
