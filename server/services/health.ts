/**
 * Health Service — system dependency checks for developer experience.
 *
 * Provides lightweight connectivity checks for all major system components:
 * - Backend (Express server)
 * - Provider APIs (Groq, Gemini, Ollama)
 * - SQLite database
 * - ChromaDB vector store
 * - Embedding model
 * - Memory service
 * - RAG pipeline
 *
 * Each component is reported with a tri-state status:
 *   - "healthy"    : component is fully operational
 *   - "degraded"   : component is reachable but partially impaired
 *   - "unavailable": component cannot be reached / not configured
 *
 * All checks are non-blocking and fail gracefully to support partial outages.
 * Health state is never cached — every call performs fresh dynamic checks.
 */

import { createLogger } from "../utils/logger";
import { getDatabase } from "../db/database";
import { getConfig } from "../config/env";
import { ragService } from "../ai/rag/service";
import { memoryService } from "../memory/service";

const logger = createLogger("HealthService");

/**
 * Tri-state health status for a single system component.
 */
export type HealthStatus = "healthy" | "degraded" | "unavailable";

/**
 * A single component's health entry.
 */
export interface ComponentHealth {
  status: HealthStatus;
  /** Optional human-readable detail (never includes secrets). */
  detail?: string;
}

/**
 * Provider-level health (Groq / Gemini / Ollama).
 */
export interface ProviderHealth {
  status: HealthStatus;
  configured: boolean;
  detail?: string;
}

/**
 * Model visibility block — what the user is currently running on.
 */
export interface ModelVisibility {
  provider: string;
  model: string;
  embeddingModel: string;
}

/**
 * Comprehensive system health report.
 */
export interface SystemHealthReport {
  backend: ComponentHealth;
  providers: {
    groq: ProviderHealth;
    gemini: ProviderHealth;
    ollama: ProviderHealth;
  };
  database: ComponentHealth;
  chromadb: ComponentHealth;
  embeddings: ComponentHealth;
  memory: ComponentHealth;
  rag: ComponentHealth;
  models: ModelVisibility;
  /** ISO timestamp of when this report was generated. */
  timestamp: string;
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
 * Check if a cloud provider (Groq / Gemini) is configured and reachable.
 * Uses the same API key and configuration as the runtime provider implementation.
 *
 * For Groq: uses the chat completions endpoint with a minimal request,
 * matching what the actual GroqProvider class does at runtime.
 *
 * For Gemini: uses the models list endpoint with the API key in the query
 * string, matching the actual GeminiProvider configuration.
 */
async function checkCloudProvider(
  name: "groq" | "gemini",
): Promise<ProviderHealth> {
  const config = getConfig();

  const apiKey =
    name === "groq" ? config.groq.apiKey : config.gemini.apiKey;

  if (!apiKey) {
    return {
      status: "unavailable",
      configured: false,
      detail: "API key not configured",
    };
  }

  // Use the same endpoint and auth mechanism as the runtime provider.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    let response: Response;

    if (name === "groq") {
      // Use the same chat completions endpoint as GroqProvider.chat()
      // with a minimal request to verify the API key works for actual inference.
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.groq.modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      });
    } else {
      // Gemini: use models list endpoint (same as before, matches config)
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: controller.signal },
      );
    }

    clearTimeout(timeout);

    if (response.ok) {
      return { status: "healthy", configured: true };
    }

    // 401/403 → configured but auth invalid → degraded
    if (response.status === 401 || response.status === 403) {
      return {
        status: "degraded",
        configured: true,
        detail: "Authentication invalid",
      };
    }

    return {
      status: "degraded",
      configured: true,
      detail: `Unexpected status ${response.status}`,
    };
  } catch {
    return {
      status: "unavailable",
      configured: true,
      detail: "Unreachable",
    };
  }
}

/**
 * Check if the embedding model is configured and reachable.
 * Uses a capability-based test: actually attempts to generate an embedding
 * using the same OllamaEmbeddings configuration as the runtime pipeline.
 *
 * This is more accurate than checking the model list because:
 * - The model may be listed but fail to generate embeddings
 * - The model may generate embeddings successfully even if not in the list
 *   (Ollama auto-pulls models on first use)
 */
async function checkEmbeddingModel(): Promise<ComponentHealth> {
  const config = getConfig();
  const baseUrl = config.ollama.baseUrl;
  const modelName = "nomic-embed-text";

  try {
    // Attempt to generate an actual embedding — this is the real capability test.
    // Uses the same endpoint and payload as the RagEmbeddings class at runtime.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: "health check ping",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { embedding?: number[] };
      if (data.embedding && data.embedding.length > 0) {
        return { status: "healthy" };
      }
      return { status: "degraded", detail: "Empty embedding returned" };
    }

    // 404 → model not available (Ollama couldn't find or pull it)
    if (response.status === 404) {
      return {
        status: "degraded",
        detail: `Model "${modelName}" not available`,
      };
    }

    return {
      status: "degraded",
      detail: `Embedding request failed (${response.status})`,
    };
  } catch {
    return { status: "unavailable", detail: "Ollama unreachable" };
  }
}

/**
 * Check if the memory service repository is initialized.
 * Verifies the underlying SQLite repository can be accessed.
 */
async function checkMemoryService(): Promise<ComponentHealth> {
  try {
    // A lightweight call that exercises the repository layer.
    memoryService.getAllGlobalMemory();
    return { status: "healthy" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { status: "unavailable", detail: errorMessage };
  }
}

/**
 * Perform comprehensive health checks on all system dependencies.
 *
 * Each check is independent and failures are logged but do not prevent
 * other checks from running. This ensures partial outages are diagnosable.
 *
 * All checks are performed dynamically on every call — no state is cached.
 *
 * @returns SystemHealthReport with tri-state status for each dependency
 */
export async function getSystemHealth(): Promise<SystemHealthReport> {
  const config = getConfig();

  const report: SystemHealthReport = {
    backend: { status: "healthy" },
    providers: {
      groq: { status: "unavailable", configured: false },
      gemini: { status: "unavailable", configured: false },
      ollama: { status: "unavailable", configured: false },
    },
    database: { status: "unavailable" },
    chromadb: { status: "unavailable" },
    embeddings: { status: "unavailable" },
    memory: { status: "unavailable" },
    rag: { status: "unavailable" },
    models: {
      provider: config.aiProvider,
      model:
        config.aiProvider === "groq"
          ? config.groq.modelName
          : config.ollama.modelName,
      embeddingModel: "nomic-embed-text",
    },
    timestamp: new Date().toISOString(),
  };

  // ── SQLite Check ────────────────────────────────────────────────────
  await runHealthCheck("SQLite", async () => {
    const db = getDatabase();
    const result = db.prepare("SELECT 1").get() as { "1": number };
    if (result && result["1"] === 1) {
      report.database = { status: "healthy" };
    } else {
      report.database = { status: "degraded", detail: "Unexpected query result" };
    }
  });

  // ── Provider Checks ─────────────────────────────────────────────────
  const [groq, gemini, ollamaReachable] = await Promise.all([
    runHealthCheck("Groq", () => checkCloudProvider("groq")),
    runHealthCheck("Gemini", () => checkCloudProvider("gemini")),
    runHealthCheck("Ollama", checkOllamaReachable),
  ]);

  if (groq) report.providers.groq = groq;
  if (gemini) report.providers.gemini = gemini;
  report.providers.ollama = ollamaReachable
    ? { status: "healthy", configured: true }
    : { status: "unavailable", configured: false, detail: "Unreachable" };

  // ── Embedding Model Check ───────────────────────────────────────────
  const embedding = await runHealthCheck("Embeddings", checkEmbeddingModel);
  if (embedding) report.embeddings = embedding;

  // ── ChromaDB Check ──────────────────────────────────────────────────
  const chromaAvailable = await runHealthCheck("ChromaDB", async () => {
    return ragService.isAvailable();
  });
  report.chromadb = chromaAvailable
    ? { status: "healthy" }
    : { status: "unavailable", detail: "Connection failed" };

  // ── Memory Service Check ────────────────────────────────────────────
  const memory = await runHealthCheck("Memory", checkMemoryService);
  if (memory) report.memory = memory;

  // ── RAG Pipeline Check ──────────────────────────────────────────────
  // RAG is healthy only when ChromaDB + embeddings are both healthy.
  // If either is down, RAG is degraded (retrieval impaired) or unavailable.
  if (report.chromadb.status === "healthy" && report.embeddings.status === "healthy") {
    const retrieverReady = await runHealthCheck("RAG Retriever", async () => {
      return ragService.isRetrieverReady();
    });
    report.rag = retrieverReady
      ? { status: "healthy" }
      : { status: "degraded", detail: "Retriever not ready" };
  } else if (
    report.chromadb.status === "degraded" ||
    report.embeddings.status === "degraded"
  ) {
    report.rag = { status: "degraded", detail: "Dependency degraded" };
  } else {
    report.rag = { status: "unavailable", detail: "Dependency unavailable" };
  }

  logger.info("System health check completed", {
    backend: report.backend.status,
    chromadb: report.chromadb.status,
    rag: report.rag.status,
  });

  return report;
}

/**
 * Quick health check that only verifies the backend is running.
 * Used for liveness probes.
 */
export function isBackendAlive(): boolean {
  return true;
}

/**
 * Legacy boolean health report (backward-compatible with /api/health).
 *
 * @deprecated Use {@link getSystemHealth} for the tri-state System Control
 * Center report. Retained so the existing /api/health endpoint keeps working.
 */
export async function getHealth(): Promise<{
  backend: boolean;
  ollama: boolean;
  chromadb: boolean;
  sqlite: boolean;
  ragReady: boolean;
}> {
  const system = await getSystemHealth();
  return {
    backend: system.backend.status === "healthy",
    ollama: system.providers.ollama.status === "healthy",
    chromadb: system.chromadb.status === "healthy",
    sqlite: system.database.status === "healthy",
    ragReady: system.rag.status === "healthy",
  };
}
