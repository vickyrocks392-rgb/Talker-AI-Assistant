/**
 * PromptInjectionDetector — RAG / retrieval security (Phase 7.4, Part 4).
 *
 * Protects retrieval from prompt-injection attacks embedded in:
 *   - user queries
 *   - uploaded document chunks
 *
 * Examples of detected patterns:
 *   - "Ignore previous instructions"
 *   - "Reveal your system prompt"
 *   - "Forget previous rules"
 *   - "Execute commands"
 *   - "Developer mode"
 *   - "Act as ..."
 *
 * Per the spec, we DO NOT automatically reject. Instead we:
 *   - flag
 *   - score
 *   - remove malicious instructions
 *   - continue retrieval safely
 *
 * This also helps prevent document poisoning, retrieval contamination, and
 * prompt leakage by stripping injection spans before they reach the model.
 */

import { SecurityConfig } from "./SecurityConfig";
import type { PromptInjectionResult } from "./SecurityTypes";
import { createLogger } from "../utils/logger";

const logger = createLogger("PromptInjection");

interface InjectionPattern {
  /** Telemetry label. */
  label: string;
  /** Regex matched against lowercased text. */
  pattern: RegExp;
  /** Score contribution (0–100). */
  score: number;
}

const DEFAULT_PATTERNS: InjectionPattern[] = [
  { label: "ignore_instructions", pattern: /\bignore (previous|prior|all|your) (instructions|rules|prompts?|context)\b/i, score: 60 },
  { label: "forget_rules", pattern: /\bforget (previous|your|all) (rules|instructions|context|memory)\b/i, score: 55 },
  { label: "reveal_system_prompt", pattern: /\b(reveal|show|print|disclose|leak) (your |the )?(system (prompt|message)|instructions|rules)\b/i, score: 70 },
  { label: "execute_commands", pattern: /\b(execute|run|eval|invoke) (the )?(following )?(command|code|script|shell)\b/i, score: 65 },
  { label: "developer_mode", pattern: /\b(developer mode|debug mode|admin mode|root mode|god mode)\b/i, score: 50 },
  { label: "act_as", pattern: /\bact as (an? )?(unfiltered|jailbreak|danzan|dan|no restriction|no limit)\b/i, score: 50 },
  { label: "system_override", pattern: /\b(you are now|from now on|new instructions|override|disregard)\b/i, score: 40 },
  { label: "prompt_leak", pattern: /\bwhat (is|was) your (system )?(prompt|instruction)\b/i, score: 45 },
  { label: "role_play_escape", pattern: /\bpretend (to be|you are) (an? )?(ai with|unrestricted|no rules)\b/i, score: 45 },
];

export class PromptInjectionDetector {
  private patterns: InjectionPattern[];

  constructor(patterns: InjectionPattern[] = DEFAULT_PATTERNS) {
    this.patterns = patterns;
  }

  /**
   * Scan text for prompt-injection attempts.
   *
   * @param text - The text to scan (query or document chunk).
   * @returns A result with detection flag, score, and a cleaned version
   *          with malicious instructions removed (if configured).
   */
  scan(text: string): PromptInjectionResult {
    const lower = text.toLowerCase();
    const detectedLabels: string[] = [];
    let score = 0;

    for (const p of this.patterns) {
      if (p.pattern.test(lower)) {
        detectedLabels.push(p.label);
        score = Math.max(score, p.score);
      }
    }

    const detected = detectedLabels.length > 0;
    let cleaned = text;
    let modified = false;

    if (detected && SecurityConfig.stripInjectionInstructions) {
      // Remove the matched injection spans (replace with a neutral marker).
      for (const p of this.patterns) {
        if (p.pattern.test(lower)) {
          cleaned = cleaned.replace(p.pattern, (sub) => "[filtered-injection]".padEnd(sub.length, " "));
          modified = true;
        }
      }
    }

    if (detected) {
      logger.warn("Prompt injection detected", {
        score,
        patterns: detectedLabels,
        flagged: score >= SecurityConfig.injectionFlagScore,
      });
    }

    return {
      detected,
      score,
      cleaned,
      patterns: detectedLabels,
      modified,
    };
  }

  /**
   * Returns true if the injection score crosses the flagging threshold.
   */
  isFlagged(text: string): boolean {
    return this.scan(text).score >= SecurityConfig.injectionFlagScore;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: PromptInjectionDetector | null = null;

export function getPromptInjectionDetector(): PromptInjectionDetector {
  if (!instance) instance = new PromptInjectionDetector();
  return instance;
}