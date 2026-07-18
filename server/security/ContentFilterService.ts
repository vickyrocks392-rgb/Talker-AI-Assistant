/**
 * ContentFilterService — centralised AI Safety Filter (Phase 7.4, Part 2).
 *
 * Applies BOTH input filtering AND output filtering. Detects configurable
 * categories:
 *   - banned words
 *   - abusive language
 *   - hate speech
 *   - explicit sexual content
 *   - graphic violence
 *   - illegal activity
 *   - self-harm instructions
 *   - malware generation requests
 *   - prompt injection attempts
 *
 * IMPORTANT: We do NOT blindly censor. We classify → decide → allow / warn /
 * redact / block. The decision is driven by a configurable severity score.
 *
 * Telemetry never stores the offending content — only category labels and
 * occurrence counts.
 */

import { SecurityConfig } from "./SecurityConfig";
import { redactTerms } from "./SecurityUtils";
import type {
  ContentCategory,
  ContentFilterResult,
  ContentMatch,
  SecurityDecision,
} from "./SecurityTypes";
import { createLogger } from "../utils/logger";

const logger = createLogger("ContentFilter");

// ── Rule definitions ───────────────────────────────────────────────────

interface Rule {
  category: ContentCategory;
  /** Human-readable rule label (telemetry only). */
  label: string;
  /** Case-insensitive regex (matched against lowercased text). */
  pattern: RegExp;
  /** Severity weight (0–100) contributed when this rule matches. */
  severity: number;
}

/**
 * Default rule set. Operators can extend via SEC_CONTENT_RULES (JSON) or by
 * editing this list. Patterns are intentionally conservative to minimise
 * false positives while still catching clear violations.
 */
const DEFAULT_RULES: Rule[] = [
  // Banned words (configurable, low-severity single hits)
  { category: "BANNED_WORDS", label: "banned:profanity", pattern: /\b(spam|scam|clickbait)\b/i, severity: 25 },

  // Abusive language
  { category: "ABUSIVE_LANGUAGE", label: "abuse:insult", pattern: /\b(idiot|stupid|moron|loser|worthless)\b/i, severity: 35 },

  // Hate speech
  { category: "HATE_SPEECH", label: "hate:slur", pattern: /\b(nazi|racist|supremacist)\b/i, severity: 85 },

  // Explicit sexual content
  { category: "EXPLICIT_SEXUAL", label: "sexual:explicit", pattern: /\b(porn|pornography|explicit sex)\b/i, severity: 70 },

  // Graphic violence
  { category: "GRAPHIC_VIOLENCE", label: "violence:graphic", pattern: /\b(gore|dismember|torture method)\b/i, severity: 65 },

  // Illegal activity
  { category: "ILLEGAL_ACTIVITY", label: "illegal:generic", pattern: /\b(how to make (a )?bomb|buy (illegal )?drugs|counterfeit money)\b/i, severity: 80 },

  // Self-harm instructions
  { category: "SELF_HARM", label: "selfharm:instructions", pattern: /\b(how to (hurt|kill) yourself|ways to self-harm|suicide method)\b/i, severity: 90 },

  // Malware generation
  { category: "MALWARE_GENERATION", label: "malware:gen", pattern: /\b(write (a )?virus|create (a )?keylogger|ransomware code|exploit (for|to))\b/i, severity: 85 },

  // Prompt injection attempts (also caught by PromptInjectionDetector)
  { category: "PROMPT_INJECTION", label: "injection:instruction", pattern: /\b(ignore (previous|all|your) (instructions|rules)|reveal your (system )?prompt|forget (previous|your) (rules|instructions)|developer mode|act as (an? )?(unfiltered|jailbreak))\b/i, severity: 50 },
];

/**
 * Default allowlist — terms that, when present, should NOT trigger a block
 * even if they superficially match a rule (e.g. discussing "suicide
 * prevention" rather than "how to suicide").
 */
const DEFAULT_ALLOWLIST: string[] = [
  "suicide prevention",
  "self-harm prevention",
  "report abuse",
  "anti-hate",
  "cybersecurity",
  "malware analysis",
  "security research",
];

// ── Service ─────────────────────────────────────────────────────────────

export class ContentFilterService {
  private rules: Rule[];
  private allowlist: string[];

  constructor(rules: Rule[] = DEFAULT_RULES, allowlist: string[] = DEFAULT_ALLOWLIST) {
    this.rules = rules;
    this.allowlist = allowlist;
  }

  /**
   * Filter a piece of text.
   *
   * @param text - The (already input-sanitised) text to evaluate.
   * @param opts - Optional flags. `isOutput` marks this as a post-LLM check.
   * @returns A structured result with decision, matches, and (if redacted)
   *          the cleaned text.
   */
  filter(text: string, opts: { isOutput?: boolean } = {}): ContentFilterResult {
    const lower = text.toLowerCase();
    const matches: ContentMatch[] = [];

    // Allowlist short-circuit: if an allowlisted phrase is present, we still
    // record matches but mark the result as allowlisted so a block is avoided.
    const allowlisted = this.allowlist.some((phrase) => lower.includes(phrase.toLowerCase()));

    for (const rule of this.rules) {
      const m = lower.match(rule.pattern);
      if (m) {
        matches.push({
          category: rule.category,
          rule: rule.label,
          severity: rule.severity,
          count: m.length,
        });
      }
    }

    // Aggregate severity = max single-match severity (a single severe hit
    // should dominate over many minor ones).
    const severity = matches.reduce((max, mm) => Math.max(max, mm.severity), 0);

    let decision: SecurityDecision = "allow";
    let filtered = text;
    let message: string | undefined;

    if (matches.length > 0) {
      if (severity >= SecurityConfig.blockSeverity && !allowlisted) {
        decision = "block";
        message = "Message blocked by content safety policy.";
      } else if (severity >= SecurityConfig.redactSeverity) {
        decision = "redact";
        // Redact the matched rule terms (not the whole message).
        const terms = matches
          .filter((mm) => mm.severity >= SecurityConfig.redactSeverity)
          .map((mm) => mm.rule.split(":")[1])
          .filter(Boolean);
        // Fallback: redact by replacing matched substrings from patterns.
        filtered = this.redactMatched(text, matches);
        message = "Some content was redacted by the safety filter.";
      } else if (severity >= SecurityConfig.warnSeverity) {
        decision = "warn";
        message = "Content flagged by safety filter.";
      }
    }

    // Telemetry: log category labels only, never the content.
    if (matches.length > 0) {
      logger.warn("Content filter match", {
        isOutput: !!opts.isOutput,
        decision,
        severity,
        categories: matches.map((m) => m.category),
      });
    }

    return {
      decision,
      matches,
      severity,
      filtered,
      allowlisted,
      message,
    };
  }

  /**
   * Redact the substrings matched by the given matches.
   * Uses the rule patterns to find and mask the offending spans.
   */
  private redactMatched(text: string, matches: ContentMatch[]): string {
    let out = text;
    for (const match of matches) {
      const rule = this.rules.find((r) => r.label === match.rule);
      if (!rule) continue;
      out = out.replace(rule.pattern, (sub) => "█".repeat(sub.length));
    }
    return out;
  }

  /**
   * Quick boolean: should this content be blocked?
   */
  isBlocked(text: string): boolean {
    return this.filter(text).decision === "block";
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: ContentFilterService | null = null;

export function getContentFilterService(): ContentFilterService {
  if (!instance) instance = new ContentFilterService();
  return instance;
}