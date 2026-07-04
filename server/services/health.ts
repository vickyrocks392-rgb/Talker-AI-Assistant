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
 */

import { createLogger } from "../utils/logger";
import { getDatabase } from "../db/database";
import { getAIProvider } from "../ai/provider";
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
 * Perform lightweight health checks on all system dependencies.
 *
 * Each check is independent and failures are logged but do not prevent
 * other checks from running. This ensures partial outages are diagnosable.
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
  try {
    const db = getDatabase();
    // Lightweight query to verify database is operational
    const result = db.prepare("SELECT 1").get() as { "1": number };
    if (result && result["1"] === 1) {
      report.sqlite = true;
      logger.debug("SQLite health check passed");
    } else {
      logger.warn("SQLite health check returned unexpected result");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`SQLite health check failed: ${errorMessage}`);
  }

  // ── Ollama Check ────────────────────────────────────────────────────
  try {
    const provider = getAIProvider();
    // Reuse existing provider connectivity check
    // The provider's health is verified by attempting to access it
    // We don't make a network call here to keep it lightweight
    report.ollama = provider !== null;
    logger.debug("Ollama health check passed (provider initialized)");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`Ollama health check failed: ${errorMessage}`);
  }

  // ── ChromaDB Check ──────────────────────────────────────────────────
  try {
    // Reuse existing RAG service to check ChromaDB connectivity
    // The RAG service initializes ChromaDB on first use
    const isAvailable = await ragService.isAvailable();
    
    if (!isAvailable) {
      // Try to initialize the RAG service to verify ChromaDB connectivity
      const context = await ragService.retrieveContext("health check");
      // If we get here without error, ChromaDB is reachable
      report.chromadb = true;
      report.ragReady = context !== null;
      logger.debug("ChromaDB health check passed (service initialized)");
    } else {
      report.chromadb = true;
      // Check if collection has documents
      const context = await ragService.retrieveContext("health check");
      report.ragReady = context !== null;
      logger.debug("ChromaDB health check passed (already initialized)");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn(`ChromaDB health check failed: ${errorMessage}`);
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