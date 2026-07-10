/**
 * Health Service — system dependency checks for developer experience.
 *
 * Provides lightweight connectivity checks for all major system components:
 * - Backend (Express server)
 * - SQLite database
 * - Ollama AI provider
 * - ChromaDB vector store
 * - RAG collection readiness
 *
 * All checks are non-blocking and fail gracefully to support partial outages.
 * Health state is never cached — every call performs fresh dynamic checks.
 */

import { createLogger } from "../utils/logger";
import { getDatabase } from "../db/database";
import { getConfig } from "../config/env";
import { ragService } from "../ai/rag/service";

const logger = createLogger("HealthService");

/**
 * Health report for all system dependencies.
 */
export interface HealthReport {
  /** Backend server is running */
  backend: boolean;
  /** Ollama AI provider is reachable */
  ollama: boolean;
  /** ChromaDB vector store is reachable */
  chromadb: boolean;
  /** SQLite database is operational */
  sqlite: boolean;
  /** RAG collection is ready for queries */
  ragReady: boolean;
}

/**
 * Execute a health check with standardized error handling.
 * Logs success at DEBUG level and failures at WARN level.
 */
async function runHealthCheck<T>(
  name: string,
  checkFn: () => Promise<T>,
): Promise<T | null> {
  try {
    const result = await checkFn();
    logger.debug(`${name} health check passed`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`${name} health check failed: ${errorMessage}`);
    return null;
  }
}

/**
 * Check if Ollama is reachable by calling its /api/tags endpoint.
 * This is a lightweight check that only verifies the server is running,
 * without loading any models or performing inference.
 */
async function checkOllamaReachable(): Promise<boolean> {
  const config = getConfig();
  const baseUrl = config.ollama.baseUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Perform lightweight health checks on all system dependencies.
 *
 * Each check is independent and failures are logged but do not prevent
 * other checks from running. This ensures partial outages are diagnosable.
 *
 * All checks are performed dynamically on every call — no state is cached.
 *
 * @returns HealthReport with boolean status for each dependency
 */
export async function getHealth(): Promise<HealthReport> {
  const report: HealthReport = {
    backend: true,
    ollama: false,
    chromadb: false,
    sqlite: false,
    ragReady: false,
  };

  // ── SQLite Check ────────────────────────────────────────────────────
  await runHealthCheck("SQLite", async () => {
    const db = getDatabase();
    // Lightweight query to verify database is operational
    const result = db.prepare("SELECT 1").get() as { "1": number };
    if (result && result["1"] === 1) {
      report.sqlite = true;
    } else {
      logger.warn("SQLite health check returned unexpected result");
    }
  });

  // ── Ollama Check ────────────────────────────────────────────────────
  // Perform a real HTTP connectivity check against Ollama's /api/tags endpoint.
  // This verifies the server is running without performing inference.
  const ollamaReachable = await runHealthCheck("Ollama", checkOllamaReachable);
  report.ollama = ollamaReachable === true;

  // ── ChromaDB Check ──────────────────────────────────────────────────
  // Use the RAG service's lightweight connectivity check.
  // This verifies ChromaDB is reachable without performing semantic search.
  const chromaAvailable = await runHealthCheck("ChromaDB", async () => {
    return ragService.isAvailable();
  });
  report.chromadb = chromaAvailable === true;

  // ── RAG Readiness Check ─────────────────────────────────────────────
  // ragReady is true when ALL of the following are true:
  //   1. Ollama is reachable (needed for embeddings)
  //   2. ChromaDB is reachable (needed for vector storage)
  //   3. The retriever is initialized (pipeline components are ready)
  //
  // This check is lightweight — it does NOT perform any semantic retrieval.
  // It only verifies connectivity and component initialization.
  if (report.ollama && report.chromadb) {
    const retrieverReady = await runHealthCheck("RAG Retriever", async () => {
      return ragService.isRetrieverReady();
    });
    report.ragReady = retrieverReady === true;
  }

  // ── Backend Check ───────────────────────────────────────────────────
  // Backend is always true if this function is executing
  report.backend = true;

  logger.info("Health check completed", { report });
  return report;
}

/**
 * Quick health check that only verifies the backend is running.
 * Used for liveness probes.
 */
export function isBackendAlive(): boolean {
  return true;
}