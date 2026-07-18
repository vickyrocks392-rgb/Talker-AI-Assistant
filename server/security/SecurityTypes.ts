/**
 * Centralised security type definitions for the Noryx backend.
 *
 * Every security subsystem (input validation, content filtering, prompt
 * injection detection, file validation, rate limiting, telemetry) shares
 * these types so that the rest of the codebase can reason about security
 * outcomes in a uniform way.
 *
 * Design principles:
 *   - Security decisions are explicit (allow / warn / redact / block).
 *   - No sensitive user content is ever stored in telemetry or logs.
 *   - Every check returns a structured result, never a bare boolean.
 */

// ── Decision vocabulary ────────────────────────────────────────────────

/**
 * The four possible dispositions a security filter can assign to content.
 *   - allow  : content is safe, proceed normally
 *   - warn   : content is suspicious, proceed but flag it
 *   - redact : content contains removable sensitive material, sanitise it
 *   - block  : content is unsafe, reject the request
 */
export type SecurityDecision = "allow" | "warn" | "redact" | "block";

// ── Input security ─────────────────────────────────────────────────────

/**
 * Result of sanitising / validating a single user input string.
 */
export interface InputSanitizationResult {
  /** The cleaned, normalised input (may be truncated / stripped). */
  sanitized: string;
  /** True if the original input was modified during sanitisation. */
  modified: boolean;
  /** True if the input was rejected outright (too large, malformed, etc.). */
  rejected: boolean;
  /** Machine-readable reason code when rejected. */
  reason?: InputRejectionReason;
  /** Human-readable message (safe to return to the client). */
  message?: string;
  /** Detected threats (for telemetry only — never includes raw content). */
  threats: InputThreat[];
}

/**
 * Reasons an input may be rejected by the InputSecurityService.
 */
export type InputRejectionReason =
  | "EMPTY_INPUT"
  | "OVERSIZED_INPUT"
  | "TOKEN_FLOODING"
  | "MALFORMED_UNICODE"
  | "UNSUPPORTED_TYPE";

/**
 * A specific threat detected during input sanitisation.
 * Used for telemetry aggregation — never stores the offending substring.
 */
export interface InputThreat {
  type: InputThreatType;
  /** Number of occurrences (for severity scoring). */
  count: number;
}

export type InputThreatType =
  | "CONTROL_CHAR"
  | "INVISIBLE_CHAR"
  | "ZERO_WIDTH"
  | "HOMOGRAPH"
  | "BIDI_OVERRIDE"
  | "NULL_BYTE"
  | "EXCESSIVE_WHITESPACE"
  | "TOKEN_REPETITION";

// ── Content filtering ──────────────────────────────────────────────────

/**
 * Categories a content filter can detect.
 */
export type ContentCategory =
  | "BANNED_WORDS"
  | "ABUSIVE_LANGUAGE"
  | "HATE_SPEECH"
  | "EXPLICIT_SEXUAL"
  | "GRAPHIC_VIOLENCE"
  | "ILLEGAL_ACTIVITY"
  | "SELF_HARM"
  | "MALWARE_GENERATION"
  | "PROMPT_INJECTION";

/**
 * Severity score for a detected category (0–100).
 * Higher means more severe. Thresholds drive the decision.
 */
export type SeverityScore = number;

/**
 * A single rule match inside the content filter.
 */
export interface ContentMatch {
  category: ContentCategory;
  /** The rule label that matched (e.g. "banned:spam"). */
  rule: string;
  /** Severity of this match (0–100). */
  severity: SeverityScore;
  /** Number of occurrences. */
  count: number;
}

/**
 * Result of running the content filter over a piece of text.
 */
export interface ContentFilterResult {
  /** Final disposition for this content. */
  decision: SecurityDecision;
  /** All matches found (for telemetry — rule labels only, no content). */
  matches: ContentMatch[];
  /** Aggregate severity across all matches (0–100). */
  severity: SeverityScore;
  /** The (possibly redacted) text to use downstream. */
  filtered: string;
  /** True if any allowlisted term prevented a block. */
  allowlisted: boolean;
  /** Human-readable message (safe to return to the client). */
  message?: string;
}

// ── Prompt injection (RAG) ─────────────────────────────────────────────

/**
 * Result of scanning text for prompt-injection attempts.
 *
 * Per the RAG security spec, we DO NOT blindly reject. We flag, score,
 * strip malicious instructions, and continue retrieval safely.
 */
export interface PromptInjectionResult {
  /** True if any injection pattern was detected. */
  detected: boolean;
  /** Aggregate injection score (0–100). */
  score: SeverityScore;
  /** The text with malicious instructions removed (safe to embed/retrieve). */
  cleaned: string;
  /** Detected pattern labels (for telemetry only). */
  patterns: string[];
  /** True if the text was modified by stripping instructions. */
  modified: boolean;
}

// ── File validation ────────────────────────────────────────────────────

/**
 * Result of validating an uploaded file.
 */
export interface FileValidationResult {
  /** Final disposition for this file. */
  decision: SecurityDecision;
  /** Sanitised, safe filename for storage. */
  safeFilename: string;
  /** Detected threats (for telemetry — never includes raw content). */
  threats: FileThreat[];
  /** Human-readable message (safe to return to the client). */
  message?: string;
  /** True if the file is a duplicate of an already-indexed document. */
  duplicate?: boolean;
}

export interface FileThreat {
  type: FileThreatType;
  detail: string;
}

export type FileThreatType =
  | "EXECUTABLE"
  | "ARCHIVE"
  | "SCRIPT"
  | "UNSUPPORTED_MIME"
  | "UNSUPPORTED_EXT"
  | "OVERSIZED"
  | "DIRECTORY_TRAVERSAL"
  | "HIDDEN_FILE"
  | "INVALID_CHARS"
  | "DUPLICATE";

// ── Rate limiting ──────────────────────────────────────────────────────

/**
 * Result of a rate-limit check.
 */
export interface RateLimitResult {
  /** True if the request is allowed to proceed. */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
  /** Total limit for the window. */
  limit: number;
}

// ── Security telemetry ─────────────────────────────────────────────────

/**
 * A single security event recorded for telemetry.
 * Never contains raw user content — only counts, categories, and decisions.
 */
export interface SecurityEvent {
  type: SecurityEventType;
  /** Disposition assigned by the security layer. */
  decision: SecurityDecision;
  /** Category or pattern label (no raw content). */
  category?: string;
  /** Number of occurrences. */
  count: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export type SecurityEventType =
  | "INPUT_FILTER"
  | "OUTPUT_FILTER"
  | "BLOCKED_REQUEST"
  | "REJECTED_FILE"
  | "PROMPT_INJECTION"
  | "RATE_LIMITED"
  | "FILE_DUPLICATE";

/**
 * Aggregated security telemetry for a single request, returned alongside
 * the AI Monitor data. Contains only non-sensitive counters and labels.
 */
export interface SecurityTelemetry {
  /** True if any security layer intervened on this request. */
  triggered: boolean;
  /** Input filter decision. */
  inputDecision: SecurityDecision;
  /** Output filter decision. */
  outputDecision: SecurityDecision;
  /** Number of prompt-injection attempts detected (RAG / input). */
  promptInjectionAttempts: number;
  /** Number of files rejected. */
  rejectedFiles: number;
  /** Number of requests rate-limited. */
  rateLimited: boolean;
  /** Detailed event log (labels + counts only). */
  events: SecurityEvent[];
}