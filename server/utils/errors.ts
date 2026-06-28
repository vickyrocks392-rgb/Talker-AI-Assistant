/**
 * Custom error types for clear error handling and reporting.
 *
 * Every application error extends the `AppError` base class which carries
 * an HTTP status code and a machine-readable error code.  The global
 * error handler reads these to produce consistent JSON responses.
 */

/**
 * Base class for all application-level errors.
 * Allows the global error handler to return consistent JSON responses.
 */
export class AppError extends Error {
  /** HTTP status code. */
  public readonly statusCode: number;
  /** Machine-readable error code. */
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Request validation error (HTTP 400).
 */
export class ValidationError extends AppError {
  /** Optional name of the field that failed validation. */
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.field = field;
  }
}

/**
 * Error originating from the Ollama API or connection.
 */
export class OllamaError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    public readonly originalError?: Error,
  ) {
    super(message, statusCode ?? 502, code);
    this.name = "OllamaError";
  }
}

/**
 * Error from parsing model response.
 */
export class ParseError extends AppError {
  constructor(
    message: string,
    public readonly rawOutput: string,
    originalError?: Error,
  ) {
    super(message, 502, "PARSE_ERROR", );
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

/**
 * Configuration or validation error at startup.
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 500, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

/**
 * Retry logic exhausted.
 */
export class RetryExhaustedError extends AppError {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message, 503, "RETRY_EXHAUSTED");
    this.name = "RetryExhaustedError";
  }
}

// ── Error predicates ────────────────────────────────────────────────

/**
 * Check if error is a retryable connection issue.
 * Returns true for: connection refused, timeout, ECONNRESET, 503.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof OllamaError) {
    return error.statusCode === 503;
  }

  const err = error as Record<string, unknown> | null;
  const message = String(err?.message ?? error).toLowerCase();
  const code = typeof err?.code === "string" ? err.code.toLowerCase() : "";

  return (
    code === "econnrefused" ||
    code === "econnreset" ||
    code === "etimedout" ||
    code === "ehostunreach" ||
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("refused")
  );
}

/**
 * Check if error is specifically connection refused.
 * Suggests the Ollama server is not running.
 */
export function isConnectionRefusedError(error: unknown): boolean {
  const err = error as Record<string, unknown> | null;
  const message = String(err?.message ?? error).toLowerCase();
  const code = typeof err?.code === "string" ? err.code.toLowerCase() : "";
  return code === "econnrefused" || message.includes("connection refused");
}

// ── User-friendly messages ──────────────────────────────────────────

/** Return a user-friendly message for display in the chat UI. */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (isConnectionRefusedError(error)) {
    return [
      `I couldn't reach your local Ollama server.`,
      ``,
      `Please ensure:`,
      `1. Ollama is installed from https://ollama.ai`,
      `2. Start the server: ollama serve`,
      `3. Verify the model exists: ollama list`,
      `4. If missing, install it: ollama pull llama3.1:8b`,
      ``,
      `Then try again!`,
    ].join("\n");
  }

  if (isRetryableError(error)) {
    return `My Ollama server is temporarily busy. Let me try again...`;
  }

  if (error instanceof ParseError) {
    return `I had trouble processing my response. Let's try again!`;
  }

  if (error instanceof ConfigError) {
    return `Server configuration error. Please check your setup.`;
  }

  return `Something went wrong. Please try again later.`;
}
