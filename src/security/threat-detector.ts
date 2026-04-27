/**
 * AI_DESK — Threat Detector
 *
 * Detects prompt injection attempts and suspicious content.
 * Scores content risk and blocks or flags as appropriate.
 */
import { eventBus } from '../shared/events.js';

export interface ThreatScanResult {
  safe: boolean;
  score: number;       // 0.0 (safe) to 1.0 (definite threat)
  threats: ThreatMatch[];
}

interface ThreatMatch {
  pattern: string;
  category: ThreatCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  matchedText: string;
}

type ThreatCategory =
  | 'prompt_injection'
  | 'jailbreak'
  | 'data_exfiltration'
  | 'command_injection'
  | 'social_engineering'
  | 'token_manipulation';

/** Threat patterns with category and severity */
const THREAT_PATTERNS: Array<{
  regex: RegExp;
  category: ThreatCategory;
  severity: ThreatMatch['severity'];
  weight: number;
  description: string;
}> = [
  // ── Prompt Injection ──
  {
    regex: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?)/i,
    category: 'prompt_injection',
    severity: 'critical',
    weight: 0.9,
    description: 'Attempt to override system prompt',
  },
  {
    regex: /you\s+are\s+now\s+(a|an|the)\s+/i,
    category: 'prompt_injection',
    severity: 'high',
    weight: 0.7,
    description: 'Persona hijacking attempt',
  },
  {
    regex: /system\s*:\s*you\s+(are|must|should|will)/i,
    category: 'prompt_injection',
    severity: 'critical',
    weight: 0.95,
    description: 'Fake system prompt injection',
  },
  {
    regex: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i,
    category: 'prompt_injection',
    severity: 'high',
    weight: 0.8,
    description: 'Raw model format token injection',
  },
  {
    regex: /```system\n|<system>|<\/system>/i,
    category: 'prompt_injection',
    severity: 'high',
    weight: 0.75,
    description: 'System tag injection',
  },

  // ── Jailbreak ──
  {
    regex: /DAN\s*mode|do\s+anything\s+now|jailbreak/i,
    category: 'jailbreak',
    severity: 'critical',
    weight: 0.9,
    description: 'Known jailbreak technique',
  },
  {
    regex: /pretend\s+(you\s+)?(are|have)\s+no\s+(restrictions?|limitations?|rules?)/i,
    category: 'jailbreak',
    severity: 'high',
    weight: 0.8,
    description: 'Restriction bypass attempt',
  },

  // ── Data Exfiltration ──
  {
    regex: /repeat\s+(the\s+)?(system\s+)?(prompt|instructions?|rules?)\s*(back|verbatim|exactly)/i,
    category: 'data_exfiltration',
    severity: 'high',
    weight: 0.8,
    description: 'System prompt extraction attempt',
  },
  {
    regex: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,
    category: 'data_exfiltration',
    severity: 'medium',
    weight: 0.5,
    description: 'System prompt query',
  },

  // ── Command Injection ──
  {
    regex: /;\s*(rm|del|format|shutdown|reboot|kill|pkill)\s/i,
    category: 'command_injection',
    severity: 'critical',
    weight: 0.95,
    description: 'Destructive command injection',
  },
  {
    regex: /`.*`\s*&&\s*|;\s*curl\s+|;\s*wget\s+/i,
    category: 'command_injection',
    severity: 'critical',
    weight: 0.9,
    description: 'Remote code execution attempt',
  },

  // ── Token Manipulation ──
  {
    regex: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'"]{8,}/i,
    category: 'token_manipulation',
    severity: 'high',
    weight: 0.7,
    description: 'Credential in message content',
  },
];

/** Threshold for blocking (0.0-1.0) */
const BLOCK_THRESHOLD = 0.7;
const WARN_THRESHOLD = 0.3;

export class ThreatDetector {
  /**
   * Scan content for threats.
   * Returns risk score and matched patterns.
   */
  scan(content: string): ThreatScanResult {
    const threats: ThreatMatch[] = [];
    let maxScore = 0;

    for (const pattern of THREAT_PATTERNS) {
      const match = content.match(pattern.regex);
      if (match) {
        threats.push({
          pattern: pattern.description,
          category: pattern.category,
          severity: pattern.severity,
          matchedText: match[0].slice(0, 100), // Truncate for log safety
        });
        maxScore = Math.max(maxScore, pattern.weight);
      }
    }

    const result: ThreatScanResult = {
      safe: maxScore < BLOCK_THRESHOLD,
      score: maxScore,
      threats,
    };

    // Emit events for monitoring
    if (maxScore >= BLOCK_THRESHOLD) {
      eventBus.emit('security:threat', {
        score: maxScore,
        threatCount: threats.length,
        categories: [...new Set(threats.map(t => t.category))],
        action: 'blocked',
      });
    } else if (maxScore >= WARN_THRESHOLD) {
      eventBus.emit('security:alert', {
        type: 'threat_warning',
        score: maxScore,
        threatCount: threats.length,
        categories: [...new Set(threats.map(t => t.category))],
      });
    }

    return result;
  }

  /**
   * Sanitize content by removing/neutralizing threat patterns.
   * Used for content that needs to be passed through despite warnings.
   */
  sanitize(content: string): string {
    let sanitized = content;

    // Neutralize model format tokens
    sanitized = sanitized.replace(/\[INST\]|\[\/INST\]/gi, '[_INST_]');
    sanitized = sanitized.replace(/<\|im_start\|>|<\|im_end\|>/gi, '<_im_>');
    sanitized = sanitized.replace(/<system>|<\/system>/gi, '<_system_>');

    // Neutralize backtick command injection
    sanitized = sanitized.replace(/`([^`]*)`\s*&&/g, '`$1` _AND_');

    return sanitized;
  }
}
