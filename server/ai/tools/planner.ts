/**
 * Deterministic planner for the Talker AI Tool Engine.
 *
 * The planner analyses a user's raw text input and decides which tool
 * to invoke (if any).  It uses simple pattern matching — **not** an LLM —
 * so routing is fast, predictable, and zero-cost.
 *
 * When no tool matches, the planner returns `null`, signalling that the
 * input should be handled by the normal chat pipeline.
 *
 * ── Adding a new route ─────────────────────────────────────────────
 *
 * 1. Create the tool file (e.g. `weather.ts`).
 * 2. Add a new `if` / `else if` branch in `plan()` below.
 * 3. Register the tool in the registry at startup.
 *
 * That's it — no LLM calls, no prompt engineering.
 */

import type { ToolRequest } from "./types";
import { createLogger } from "../../utils/logger";

const logger = createLogger("ToolPlanner");

// ── Pattern helpers ────────────────────────────────────────────────

/**
 * Check if `input` matches the given regex and extract named groups.
 */
function match(input: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(input.trim());
}

// ── Expression parser ──────────────────────────────────────────────

/**
 * Attempt to parse a simple arithmetic expression like "2+2", "10 * 5".
 *
 * Supports: +, -, *, /
 * Handles optional whitespace around the operator.
 */
const CALC_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/;

function parseCalculator(input: string): ToolRequest | null {
  const m = match(input, CALC_PATTERN);
  if (!m) return null;

  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  const operator = m[2] as "+" | "-" | "*" | "/";

  // Guard: division by zero
  if (operator === "/" && b === 0) {
    logger.warn("Calculator: division by zero rejected");
    return null;
  }

  return {
    toolName: "calculator",
    args: { a, b, operator },
  };
}

// ── DateTime patterns ──────────────────────────────────────────────

/**
 * Match questions about the current date, time, or timestamp.
 *
 * These patterns are intentionally broad — they catch natural language
 * variants like "what time is it", "current date", "tell me the time".
 */
const DATETIME_PATTERNS = [
  /what(?:\s+is)?\s+(?:the\s+)?(?:current\s+)?(?:date|time|timestamp)/i,
  /(?:current\s+)?(?:date|time|timestamp)(?:\s+now)?/i,
  /what\s+time\s+is\s+it/i,
  /tell\s+me\s+(?:the\s+)?(?:date|time)/i,
  /what\s+(?:day|month|year)\s+is\s+it/i,
  /what\s+is\s+the\s+(?:date|time)/i,
];

function parseDateTime(input: string): ToolRequest | null {
  const trimmed = input.trim().toLowerCase();

  // Quick rejection: skip long sentences that happen to contain a keyword
  if (trimmed.split(/\s+/).length > 20) return null;

  for (const pattern of DATETIME_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { toolName: "datetime", args: {} };
    }
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Analyse the user's input and produce a tool request if a matching
 * tool is found.
 *
 * @param input – The raw text from the user.
 * @returns A {@link ToolRequest} if a tool matches, or `null` to fall
 *          through to the normal chat pipeline.
 */
export function plan(input: string): ToolRequest | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  logger.debug(`Planning for input: "${trimmed}"`);

  // Try calculator first (most specific pattern)
  const calcRequest = parseCalculator(trimmed);
  if (calcRequest) {
    logger.info(`Planner → calculator`);
    return calcRequest;
  }

  // Try date/time patterns
  const dtRequest = parseDateTime(trimmed);
  if (dtRequest) {
    logger.info(`Planner → datetime`);
    return dtRequest;
  }

  logger.debug(`Planner → no match (fall through to chat)`);
  return null;
}