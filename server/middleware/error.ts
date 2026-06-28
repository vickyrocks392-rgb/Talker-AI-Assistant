/**
 * Global Express error-handling middleware.
 *
 * - `apiNotFoundHandler` catches unknown `/api/*` routes and returns 404.
 * - `globalErrorHandler` catches any thrown/rejected error and returns a
 *   consistent JSON shape, hiding internal details in production.
 */

import type { Request, Response, NextFunction } from "express";
import { getConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { createLogger } from "../utils/logger";

const logger = createLogger("ErrorHandler");

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Handle requests to unknown `/api/*` paths.
 * Place this **after** all defined API routes and **before** the SPA
 * catch-all (`app.get("*", serveIndexHtml)`).
 */
export function apiNotFoundHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API endpoint does not exist.",
    },
  } satisfies ErrorResponse);
}

/**
 * Global error-handling middleware (four-argument signature).
 *
 * Converts any thrown error into a consistent JSON response:
 *   - AppError subclasses → their own statusCode / code
 *   - Everything else     → 500 INTERNAL_ERROR (message hidden in production)
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const config = getConfig();

  if (err instanceof AppError) {
    logger.error(`[${err.code}] ${err.message}`, err);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    } satisfies ErrorResponse);
    return;
  }

  // Unknown / unexpected errors — log the details but hide them from the client
  logger.error("Unhandled error", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: config.server.isProduction
        ? "An unexpected error occurred."
        : err.message || "An unexpected error occurred.",
    },
  } satisfies ErrorResponse);
}
