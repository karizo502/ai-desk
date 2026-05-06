import { describe, it, expect } from 'vitest';
import { scrub, hasSensitiveContent, scrubTrace } from '../security/pii-scrub.js';

describe('scrub — email', () => {
  it('redacts email addresses', () => {
    expect(scrub('Contact admin@example.com for help')).not.toContain('admin@example.com');
  });
  it('keeps non-email text', () => {
    expect(scrub('Hello world')).toBe('Hello world');
  });
});

describe('scrub — phone', () => {
  it('redacts Thai phone numbers', () => {
    expect(scrub('Call 081-234-5678 now')).not.toContain('081-234-5678');
    expect(scrub('โทร 0891234567')).not.toContain('0891234567');
  });
  it('redacts international phone numbers', () => {
    expect(scrub('+1 (555) 867-5309')).not.toContain('867-5309');
  });
});

describe('scrub — API keys', () => {
  it('redacts Anthropic keys', () => {
    const key = 'sk-ant-api03-ABCDEF1234567890abcdef1234567890abcdef';
    expect(scrub(`key=${key}`)).not.toContain(key);
  });
  it('redacts OpenAI keys', () => {
    const key = 'sk-' + 'A'.repeat(48);
    expect(scrub(`OPENAI_API_KEY=${key}`)).not.toContain(key);
  });
  it('redacts AWS access keys', () => {
    const key = 'AKIAIOSFODNN7EXAMPLE';
    expect(scrub(`aws_access_key_id=${key}`)).not.toContain(key);
  });
  it('redacts GitHub tokens', () => {
    const key = 'ghp_' + 'A'.repeat(36);
    expect(scrub(`token: ${key}`)).not.toContain(key);
  });
  it('redacts Bearer tokens', () => {
    expect(scrub('Authorization: Bearer eyJmaketoken123')).not.toContain('eyJmaketoken123');
  });
  it('redacts Authorization headers', () => {
    const h = 'Authorization: Token abc123secret';
    expect(scrub(h)).not.toContain('abc123secret');
  });
});

describe('scrub — JWT', () => {
  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiJKb2huIERvZSIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(scrub(jwt)).not.toContain('eyJzdWIi');
  });
});

describe('scrub — IPv4', () => {
  it('redacts IP addresses', () => {
    expect(scrub('server at 192.168.1.100 failed')).not.toContain('192.168.1.100');
    expect(scrub('public: 8.8.8.8')).not.toContain('8.8.8.8');
  });
});

describe('hasSensitiveContent', () => {
  it('detects emails', () => {
    expect(hasSensitiveContent('user@domain.com')).toBe(true);
  });
  it('returns false for clean text', () => {
    expect(hasSensitiveContent('refactor the authentication module')).toBe(false);
  });
  it('detects API keys', () => {
    expect(hasSensitiveContent('key=sk-ant-api03-' + 'x'.repeat(30))).toBe(true);
  });
});

describe('scrubTrace', () => {
  it('scrubs content and toolOutput fields', () => {
    const turns = [
      {
        sessionId: 's1', idx: 0, role: 'user' as const,
        content: 'My email is user@test.com',
      },
      {
        sessionId: 's1', idx: 1, role: 'tool' as const,
        content: 'result',
        toolOutput: 'api_key=sk-ant-api03-xxxxxxxxxxxxxxxxxxx',
        toolName: 'read_file',
      },
    ];
    const scrubbed = scrubTrace(turns);
    expect(scrubbed[0].content).not.toContain('user@test.com');
    expect(scrubbed[1].toolOutput).not.toContain('sk-ant-api03');
  });

  it('scrubs toolInput string values', () => {
    const turns = [
      {
        sessionId: 's1', idx: 0, role: 'tool' as const,
        content: 'ok',
        toolName: 'http_request',
        toolInput: { headers: 'Bearer sk-abc12345678901234567890123456789012' },
      },
    ];
    const scrubbed = scrubTrace(turns);
    expect(JSON.stringify(scrubbed[0].toolInput)).not.toContain('sk-abc');
  });

  it('does not mutate original turns', () => {
    const turns = [
      { sessionId: 's1', idx: 0, role: 'user' as const, content: 'user@email.com' },
    ];
    scrubTrace(turns);
    expect(turns[0].content).toBe('user@email.com');
  });
});
