/**
 * Robust retry logic for API calls.
 * Focuses on real connection issues, not quota.
 * Uses exponential backoff for transient failures.
 */

import { isRetryableError, OllamaError, RetryExhaustedError } from "./errors";
import { createLogger } from "./logger";

const logger = createLogger("Retry");

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with exponential backoff retry.
 * Only retries on connection errors, not on other failures.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result from fn if successful
 * @throws RetryExhaustedError if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // If not retryable, fail immediately
      if (!isRetryableError(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === config.maxAttempts) {
        logger.warn(`Retry exhausted after ${attempt} attempts`, err.message);
        throw new RetryExhaustedError(
          `Failed after ${attempt} attempts`,
          attempt,
          err,
        );
      }

      // Calculate exponential backoff delay
      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelayMs,
      );

      logger.debug(
        `Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delayMs}ms`,
        err.message,
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw lastError || new Error("Unknown error in retry logic");
}


