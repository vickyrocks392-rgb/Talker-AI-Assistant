/**
 * InputSecurityService — centralised input validation & sanitisation.
 *
 * Responsibilities (Phase 7.4, Part 1):
 *   - sanitise user input
 *   - normalise whitespace
 *   - remove dangerous control / invisible characters
 *   - enforce maximum length
 *   - reject malformed payloads (bad Unicode)
 *   - detect repeated-token flooding
 *
 * This service is the single entry point for cleaning any untrusted text
 * before it reaches the AI pipeline. It is intentionally conservative: it
 * never throws on bad input — it returns a structured result so the caller
 * can decide whether to block, warn, or proceed.
 */

import { SecurityConfig } from "./SecurityConfig";
import {
  stripControlCharacters,
  normalizeWhitespace,
  detectTokenFlooding,
  isWellFormedUtf8,
} from "./SecurityUtils";
import type {
  InputSanitizationResult,
  InputThreat,
  InputThreatType,
} from "./SecurityTypes";
import { createLogger } from "../utils/logger";

const logger = createLogger("InputSecurity");

export class InputSecurityService {
  /**
   * Sanitise and validate a single user input string.
   *
   * @param input - The raw, untrusted input.
   * @param opts - Optional overrides (e.g. maxLength for a specific field).
   * @returns A structured result describing what happened.
   */
  sanitize(
    input: unknown,
    opts: { maxLength?: number; field?: string } = {},
  ): InputSanitizationResult {
    const field = opts.field ?? "input";
    const maxLength = opts.maxLength ?? SecurityConfig.maxInputLength;

    // ── Type guard ──
    if (typeof input !== "string") {
      return {
        sanitized: "",
        modified: false,
        rejected: true,
        reason: "UNSUPPORTED_TYPE",
        message: `Field "${field}" must be a string.`,
        threats: [],
      };
    }

    // ── Empty check ──
    if (input.trim().length === 0) {
      return {
        sanitized: "",
        modified: false,
        rejected: true,
        reason: "EMPTY_INPUT",
        message: `Field "${field}" cannot be empty.`,
        threats: [],
      };
    }

    // ── Malformed Unicode check ──
    if (!isWellFormedUtf8(input)) {
      return {
        sanitized: "",
        modified: false,
        rejected: true,
        reason: "MALFORMED_UNICODE",
        message: `Field "${field}" contains malformed characters.`,
        threats: [{ type: "CONTROL_CHAR", count: 1 }],
      };
    }

    // ── Oversized check (before sanitisation so we don't process huge input) ──
    if (input.length > maxLength) {
      return {
        sanitized: "",
        modified: false,
        rejected: true,
        reason: "OVERSIZED_INPUT",
        message: `Field "${field}" exceeds the maximum length of ${maxLength} characters.`,
        threats: [],
      };
    }

    const threats: InputThreat[] = [];
    let working = input;

    // ── Strip control / invisible characters ──
    const { cleaned, scan } = stripControlCharacters(working);
    if (scan.nullCount > 0) {
      threats.push({ type: "NULL_BYTE", count: scan.nullCount });
    }
    if (scan.zeroWidthCount > 0) {
      threats.push({ type: "ZERO_WIDTH", count: scan.zeroWidthCount });
    }
    if (scan.bidiCount > 0) {
      threats.push({ type: "BIDI_OVERRIDE", count: scan.bidiCount });
    }
    if (scan.controlCount > 0) {
      threats.push({ type: "CONTROL_CHAR", count: scan.controlCount });
    }
    working = cleaned;

    // ── Normalise whitespace ──
    const normalised = normalizeWhitespace(working);
    if (normalised !== working) {
      threats.push({ type: "EXCESSIVE_WHITESPACE", count: 1 });
    }
    working = normalised;

    // ── Token flooding detection ──
    const flood = detectTokenFlooding(working);
    if (flood.ratio >= SecurityConfig.tokenFloodRatio && flood.dominantCount > 0) {
      threats.push({ type: "TOKEN_REPETITION", count: flood.dominantCount });
      // Reject obvious flooding — it's not a legitimate query.
      return {
        sanitized: working,
        modified: true,
        rejected: true,
        reason: "TOKEN_FLOODING",
        message: `Field "${field}" contains repeated-token flooding and was rejected.`,
        threats,
      };
    }

    const modified = threats.length > 0 || working !== input;

    logger.debug("Input sanitised", {
      field,
      originalLength: input.length,
      sanitizedLength: working.length,
      modified,
      threatCount: threats.length,
    });

    return {
      sanitized: working,
      modified,
      rejected: false,
      threats,
    };
  }

  /**
   * Convenience helper: throw a ValidationError-style rejection if the input
   * was rejected. Returns the sanitised string otherwise.
   *
   * @throws {Error} with a safe message when rejected.
   */
  sanitizeOrThrow(input: unknown, opts?: { maxLength?: number; field?: string }): string {
    const result = this.sanitize(input, opts);
    if (result.rejected) {
      throw new Error(result.message ?? "Input rejected by security policy.");
    }
    return result.sanitized;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: InputSecurityService | null = null;

export function getInputSecurityService(): InputSecurityService {
  if (!instance) instance = new InputSecurityService();
  return instance;
}