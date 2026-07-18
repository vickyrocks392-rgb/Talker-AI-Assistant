/**
 * Centralised, environment-driven configuration for all security services.
 *
 * Every limit and threshold used by the security layer is defined here so
 * that operators can tune behaviour without touching code. Sensible,
 * conservative defaults are applied when an environment variable is absent.
 */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

export interface SecurityConfigShape {
  // ── Input limits ──
  /** Maximum characters allowed in a single chat message. */
  maxInputLength: number;
  /** Maximum characters allowed in a single document chunk query. */
  maxQueryLength: number;
  /** Maximum repeated-token ratio before flagging token flooding (0–1). */
  tokenFloodRatio: number;
  /** Minimum distinct tokens required before flooding check applies. */
  tokenFloodMinTokens: number;

  // ── Content filter ──
  /** Severity (0–100) at/above which content is blocked. */
  blockSeverity: number;
  /** Severity (0–100) at/above which content is redacted. */
  redactSeverity: number;
  /** Severity (0–100) at/above which content is warned. */
  warnSeverity: number;
  /** Enable the output filter (post-LLM). */
  enableOutputFilter: boolean;
  /** Enable the input filter (pre-LLM). */
  enableInputFilter: boolean;

  // ── Prompt injection ──
  /** Injection score (0–100) at/above which retrieval is flagged. */
  injectionFlagScore: number;
  /** Whether to strip detected injection instructions from queries. */
  stripInjectionInstructions: boolean;

  // ── File validation ──
  /** Maximum upload size in MB (mirrors RAG_MAX_UPLOAD_SIZE_MB). */
  maxFileSizeMB: number;
  /** Reject duplicate uploads (same original name + size). */
  rejectDuplicateUploads: boolean;

  // ── Rate limiting ──
  /** Max requests per window per client. */
  rateLimitMax: number;
  /** Window length in seconds. */
  rateLimitWindowSec: number;
  /** Enable rate limiting middleware. */
  enableRateLimit: boolean;

  // ── Telemetry ──
  /** Enable security telemetry collection. */
  enableTelemetry: boolean;
}

export const SecurityConfig: SecurityConfigShape = {
  maxInputLength: intEnv("SEC_MAX_INPUT_LENGTH", 8000),
  maxQueryLength: intEnv("SEC_MAX_QUERY_LENGTH", 2000),
  tokenFloodRatio: parseFloat(process.env.SEC_TOKEN_FLOOD_RATIO ?? "0.6") || 0.6,
  tokenFloodMinTokens: intEnv("SEC_TOKEN_FLOOD_MIN_TOKENS", 20),

  blockSeverity: intEnv("SEC_BLOCK_SEVERITY", 80),
  redactSeverity: intEnv("SEC_REDACT_SEVERITY", 55),
  warnSeverity: intEnv("SEC_WARN_SEVERITY", 30),
  enableOutputFilter: boolEnv("SEC_ENABLE_OUTPUT_FILTER", true),
  enableInputFilter: boolEnv("SEC_ENABLE_INPUT_FILTER", true),

  injectionFlagScore: intEnv("SEC_INJECTION_FLAG_SCORE", 40),
  stripInjectionInstructions: boolEnv("SEC_STRIP_INJECTION", true),

  maxFileSizeMB: intEnv("RAG_MAX_UPLOAD_SIZE_MB", 10),
  rejectDuplicateUploads: boolEnv("SEC_REJECT_DUPLICATES", true),

  rateLimitMax: intEnv("SEC_RATE_LIMIT_MAX", 60),
  rateLimitWindowSec: intEnv("SEC_RATE_LIMIT_WINDOW_SEC", 60),
  enableRateLimit: boolEnv("SEC_ENABLE_RATE_LIMIT", true),

  enableTelemetry: boolEnv("SEC_ENABLE_TELEMETRY", true),
};