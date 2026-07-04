/**
 * Token budgeting for the Context Builder.
 *
 * Provides a lightweight, character-count-based token approximation.
 * The implementation is intentionally simple and cheap — no external
 * tokenizer libraries are used. The strategy is designed to be easily
 * replaceable with a more accurate tokenizer in the future.
 *
 * Priority order (highest to lowest):
 *   1. System Prompt (Critical)
 *   2. Current User Message (Critical)
 *   3. Tool Results (High)
 *   4. Retrieved Knowledge / RAG (Medium)
 *   5. Conversation History (Low)
 *
 * Usage:
 * ```ts
 * const budgeter = new TokenBudgeter({ maxContextChars: 12000 });
 * const sections = budgeter.applyBudget(sections);
 * ```
 */

import { createLogger } from "../../utils/logger";
import type { ContextSection } from "./types";
import { ContextPriority } from "./types";

const logger = createLogger("TokenBudgeter");

// ── Constants ───────────────────────────────────────────────────────

/**
 * Default maximum context size in characters.
 * This is a conservative approximation:
 *   - ~4 characters per token (English text average)
 *   - 8192 token context window → ~32768 characters
 *   - We use 12000 as a safe default to leave room for generation
 */
const DEFAULT_MAX_CHARS = 12000;

/**
 * Character-to-token ratio used for approximation.
 * ~4 characters per token is a reasonable heuristic for English text.
 * This can be adjusted per-model if needed.
 */
const CHARS_PER_TOKEN = 4;

// ── Token Budgeter ──────────────────────────────────────────────────

export interface TokenBudgeterConfig {
  /** Maximum context size in characters. */
  maxContextChars?: number;
}

export class TokenBudgeter {
  private readonly maxContextChars: number;

  constructor(config: TokenBudgeterConfig = {}) {
    this.maxContextChars = config.maxContextChars ?? DEFAULT_MAX_CHARS;
    logger.debug(
      `TokenBudgeter initialized: maxContextChars=${this.maxContextChars} ` +
      `(~${Math.round(this.maxContextChars / CHARS_PER_TOKEN)} tokens)`,
    );
  }

  /**
   * Estimate the number of tokens from a character count.
   *
   * This is a lightweight approximation. Replace this method with a
   * proper tokenizer (e.g., `tiktoken`) for production-grade accuracy.
   *
   * @param chars - The character count.
   * @returns Estimated token count.
   */
  estimateTokens(chars: number): number {
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  /**
   * Estimate the character count of a string in tokens.
   *
   * @param text - The text to estimate.
   * @returns Estimated token count.
   */
  estimateTextTokens(text: string): number {
    return this.estimateTokens(text.length);
  }

  /**
   * Apply the token budget to a list of context sections.
   *
   * Sections are processed in their original insertion order. Priority is
   * used only to decide whether to keep, truncate, or drop each section.
   * Original chronological order is always preserved — this is critical
   * for correct interleaved conversation history (user → assistant → user).
   *
   * Priority rules:
   *   - Critical (0): Always included in full, even if over budget.
   *   - High (1):     Always included in full, even if over budget.
   *   - Medium (2):   Truncated to fit remaining budget, or dropped if no space.
   *   - Low (3):      Dropped entirely when over budget.
   *
   * @param sections - The context sections to budget (in original order).
   * @returns The sections that fit within the budget, in original order.
   */
  applyBudget(sections: ContextSection[]): ContextSection[] {
    const result: ContextSection[] = [];
    let usedChars = 0;

    for (const section of sections) {
      const sectionChars = section.content.length;

      if (usedChars + sectionChars <= this.maxContextChars) {
        // Section fits entirely
        result.push(section);
        usedChars += sectionChars;
        logger.debug(
          `Budget: included "${section.label}" (${sectionChars} chars, ` +
          `priority=${section.priority})`,
        );
      } else if (section.priority <= ContextPriority.High) {
        // High-priority sections: include even if over budget
        result.push(section);
        usedChars += sectionChars;
        logger.warn(
          `Budget: over budget for high-priority section "${section.label}" ` +
          `(${sectionChars} chars, total=${usedChars}/${this.maxContextChars})`,
        );
      } else if (section.priority === ContextPriority.Medium) {
        // Medium priority: truncate to fit remaining budget
        const remaining = this.maxContextChars - usedChars;
        if (remaining > 50) {
          const truncated: ContextSection = {
            ...section,
            content: section.content.slice(0, remaining),
          };
          result.push(truncated);
          usedChars += truncated.content.length;
          logger.debug(
            `Budget: truncated "${section.label}" to ${truncated.content.length} chars`,
          );
        } else {
          logger.debug(
            `Budget: dropped "${section.label}" (no space for medium priority)`,
          );
        }
      } else {
        // Low priority: drop entirely
        logger.debug(
          `Budget: dropped "${section.label}" (low priority, over budget)`,
        );
      }
    }

    return result;
  }

  /**
   * Get the maximum context size in characters.
   */
  getMaxChars(): number {
    return this.maxContextChars;
  }
}