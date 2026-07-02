/**
 * Core type definitions for the Talker AI Tool Engine.
 *
 * Every tool must conform to the {@link Tool} interface.  The planner
 * produces a {@link ToolRequest} that the executor resolves via the
 * registry and returns a {@link ToolResult}.
 */

// ── Tool interface ─────────────────────────────────────────────────

/**
 * A single callable tool with a name, description, and executable body.
 *
 * Tools are stateless by design — any state they need should be passed
 * via `args` or obtained from external services at execution time.
 */
export interface Tool<R = unknown> {
  /** Unique machine-readable identifier (e.g. "calculator"). */
  readonly name: string;

  /** Human-readable description shown to the planner or user. */
  readonly description: string;

  /**
   * Execute the tool with the given arguments and return a structured result.
   *
   * The executor passes a raw `Record<string, unknown>` from the planner.
   * Each tool is responsible for validating and casting its own arguments.
   *
   * @param args – Tool-specific arguments (validated internally by the tool).
   * @returns A promise that resolves to a {@link ToolResult}.
   */
  execute(args: Record<string, unknown>): Promise<ToolResult<R>>;
}

// ── Request / Result types ─────────────────────────────────────────

/**
 * A fully resolved tool invocation produced by the planner.
 *
 * The executor consumes this to look up the tool and call
 * `tool.execute(request.args)`.
 */
export interface ToolRequest {
  /** The `name` of a registered tool. */
  toolName: string;

  /** Arguments to forward to the tool's `execute` method. */
  args: Record<string, unknown>;
}

/**
 * Structured result returned by every tool.
 *
 * Tools MUST set `success: true` on success and SHOULD provide `data`.
 * On failure they MUST set `success: false` and SHOULD provide a human-
 * readable `error` string.
 */
export type ToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Calculator-specific types ──────────────────────────────────────

/** Supported arithmetic operators. */
export type BinaryOperator = "+" | "-" | "*" | "/";

/** Arguments expected by the calculator tool. */
export interface CalculatorArgs {
  a: number;
  b: number;
  operator: BinaryOperator;
}

/** Result shape returned by the calculator tool. */
export interface CalculatorResult {
  expression: string;
  result: number;
}

// ── DateTime-specific types ────────────────────────────────────────

/** Result shape returned by the date-time tool. */
export interface DateTimeResult {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM:SS (24-hour, local)
  iso: string;        // ISO 8601 full timestamp
  timezone: string;   // e.g. "Asia/Calcutta", "UTC"
}