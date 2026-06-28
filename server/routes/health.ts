/**
 * Production health / readiness / version endpoints.
 *
 * These endpoints are intentionally kept lightweight and do not log
 * on every call to avoid noise in the log stream.
 */

import { Router } from "express";
import { getConfig } from "../config/env";
import { getActiveModel, getOllamaBaseUrl } from "../ai/config";
import { APP_NAME, APP_VERSION } from "../config/version";
import { getOllamaProvider } from "../ai/ollama";

const router = Router();

/**
 * GET /health
 * Liveness probe — always returns 200 as long as the process is alive.
 */
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    model: getActiveModel().name,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready
 * Readiness probe — returns 200 only when the AI provider is initialised.
 * The Ollama server is reachable (best-effort).
 */
router.get("/ready", async (_req, res) => {
  const config = getConfig();

  // Verify the provider singleton exists.
  try {
    getOllamaProvider();
  } catch {
    res.status(503).json({ status: "not ready", reason: "AI provider not initialised" });
    return;
  }

  // Quick connectivity check against the Ollama server.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(503).json({ status: "not ready", reason: "Ollama server unreachable" });
      return;
    }
  } catch {
    res.status(503).json({ status: "not ready", reason: "Ollama server unreachable" });
    return;
  }

  res.json({ status: "ready", uptime: process.uptime() });
});

/**
 * GET /version
 * Static build metadata.
 */
router.get("/version", (_req, res) => {
  const model = getActiveModel();
  res.json({
    name: APP_NAME,
    version: APP_VERSION,
    node: process.version,
    model: model.name,
    uptime: process.uptime(),
  });
});

export default router;
