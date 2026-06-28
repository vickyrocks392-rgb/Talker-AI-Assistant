/**
 * Talker AI Backend Server
 * 
 * A production-quality conversational AI application using local Ollama models.
 * 
 * Architecture:
 * - server/ai/       : AI logic (models, prompts, parsing)
 * - server/routes/   : API endpoint handlers
 * - server/utils/    : Shared utilities (logging, retry, errors)
 * - server.ts        : Express app configuration (this file)
 * 
 * Key Features:
 * ✓ Native Ollama API integration
 * ✓ Streaming responses (Server-Sent Events)
 * ✓ Robust JSON parsing with fallback
 * ✓ Exponential backoff retry logic
 * ✓ Strong TypeScript typing
 * ✓ Structured logging
 * ✓ Local troubleshooting error messages
 * ✓ Modular provider architecture for future extensibility
 * 
 * To get started:
 * 1. Install Ollama: https://ollama.ai
 * 2. Download a model: ollama pull llama3.1:8b
 * 3. Start the server: ollama serve
 * 4. Run this backend: npm run dev
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Configuration
import { getConfig } from "./server/config/env";
import { getActiveModel, getOllamaBaseUrl } from "./server/ai/config";
import { getOllamaProvider } from "./server/ai/ollama";

// Utilities
import { createLogger } from "./server/utils/logger";
import { ConfigError } from "./server/utils/errors";

// Route handlers
import { handleChat } from "./server/routes/chat";
import { handleSummarize } from "./server/routes/summarize";
import { handleTTS } from "./server/routes/tts";
import healthRouter from "./server/routes/health";

// Middleware
import { apiNotFoundHandler, globalErrorHandler } from "./server/middleware/error";

// Load environment variables
dotenv.config();

const config = getConfig();
const logger = createLogger("Server");
const app = express();

// ── Middleware ──────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));

// ── API Routes ──────────────────────────────────────────────────────

// Health / ready / version (no /api prefix — common ops convention)
app.use("/", healthRouter);

app.post("/api/chat", handleChat);
app.post("/api/summarize", handleSummarize);
app.post("/api/tts", handleTTS);

// Catch-all for unknown /api/* paths
app.use("/api", apiNotFoundHandler);

// Global error handler (must be last middleware)
app.use(globalErrorHandler);

// ── Startup ─────────────────────────────────────────────────────────

async function start() {
  try {
    logger.info("Validating configuration...");
    const model = getActiveModel();
    const baseUrl = getOllamaBaseUrl();

    logger.info(`Using model: ${model.name}`);
    logger.info(`Ollama endpoint: ${baseUrl}/api/chat`);

    // Warm up the provider (lazy singleton initialisation)
    getOllamaProvider();
    logger.info("AI provider initialized");

    // Frontend serving
    if (config.server.isDevelopment) {
      logger.info("Starting in development mode with Vite middleware...");
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: config.vite.disableHmr ? false : config.vite.hmrPort ? { port: config.vite.hmrPort } : undefined,
          watch: config.vite.disableHmr ? null : undefined,
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      logger.info("Starting in production mode...");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(config.server.port, "0.0.0.0", () => {
      logger.info(`\n╔══════════════════════════════════════╗`);
      logger.info(`║  Talker AI Backend Started           ║`);
      logger.info(`╚══════════════════════════════════════╝\n`);
      logger.info(`Server:   http://localhost:${config.server.port}`);
      logger.info(`Model:    ${model.name}`);
      logger.info(`Ollama:   ${baseUrl}\n`);
      logger.info(`API Endpoints:`);
      logger.info(`  POST   /api/chat       Chat with streaming support`);
      logger.info(`  POST   /api/summarize  Generate conversation title`);
      logger.info(`  POST   /api/tts        Text-to-speech fallback`);
      logger.info(`  GET    /health         Server health check\n`);

      if (config.server.isDevelopment) {
        logger.info(`Frontend: http://localhost:${config.server.port}\n`);
      }
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    if (error instanceof ConfigError) {
      logger.error("\nConfiguration Error. Please check:");
      logger.error("1. OLLAMA_URL is set correctly (default: http://127.0.0.1:11434)");
      logger.error("2. OLLAMA_MODEL exists on your Ollama installation");
      logger.error("3. Run 'ollama list' to see available models");
      logger.error("4. Run 'ollama pull <model>' to install a model\n");
    }
    process.exit(1);
  }
}

start();
