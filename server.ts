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
import { createServer as createViteServer } from "vite";

// Configuration
import { getConfig } from "./server/config/env";
import { getAIProvider } from "./server/ai/provider";

// Utilities
import { createLogger } from "./server/utils/logger";
import { ConfigError } from "./server/utils/errors";

// Route handlers
import { handleChat } from "./server/routes/chat";
import { handleSummarize } from "./server/routes/summarize";
import { handleTTS } from "./server/routes/tts";
import healthRouter from "./server/routes/health";
import conversationsRouter from "./server/routes/conversations";
import ragRouter from "./server/routes/rag";

// Tool Engine
import { ToolRegistry } from "./server/ai/tools/registry";
import { CalculatorTool } from "./server/ai/tools/calculator";
import { DateTimeTool } from "./server/ai/tools/datetime";

// Middleware
import { apiNotFoundHandler, globalErrorHandler } from "./server/middleware/error";

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
app.use("/", conversationsRouter);
app.use("/api", ragRouter);

// Catch-all for unknown /api/* paths
app.use("/api", apiNotFoundHandler);

// Global error handler (must be last middleware)
app.use(globalErrorHandler);

// ── Startup ─────────────────────────────────────────────────────────

async function start() {
  try {
    logger.info("Validating configuration...");

    // Log provider-specific info
    if (config.aiProvider === "groq") {
      logger.info(`Using model: ${config.groq.modelName}`);
      logger.info(`AI provider: Groq`);
    } else {
      logger.info(`Using model: ${config.ollama.modelName}`);
      logger.info(`Ollama endpoint: ${config.ollama.baseUrl}/api/chat`);
    }

    // Warm up the provider (lazy singleton initialisation)
    getAIProvider();
    logger.info("AI provider initialized");

    // ── Tool Engine registration ──────────────────────────────────
    const registry = ToolRegistry.getInstance();
    registry.register(new CalculatorTool());
    registry.register(new DateTimeTool());
    logger.info(`Tool Engine initialized with ${registry.list().length} tools`);

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
      logger.info(`Model:    ${config.aiProvider === "groq" ? config.groq.modelName : config.ollama.modelName}`);
      if (config.aiProvider === "ollama") {
        logger.info(`Ollama:   ${config.ollama.baseUrl}\n`);
      } else {
        logger.info(`\n`);
      }
      logger.info(`API Endpoints:`);
      logger.info(`  POST   /api/chat       Chat with streaming support`);
      logger.info(`  POST   /api/summarize  Generate conversation title`);
      logger.info(`  POST   /api/tts        Text-to-speech fallback`);
      logger.info(`  GET    /health         Server health check`);
      logger.info(`  GET    /api/conversations          List conversations`);
      logger.info(`  POST   /api/conversations          Create conversation`);
      logger.info(`  GET    /api/conversations/:id      Get conversation`);
      logger.info(`  PATCH  /api/conversations/:id      Update conversation`);
      logger.info(`  DELETE /api/conversations/:id      Delete conversation\n`);

      if (config.server.isDevelopment) {
        logger.info(`Frontend: http://localhost:${config.server.port}\n`);
      }
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    if (error instanceof ConfigError) {
      if (config.aiProvider === "groq") {
        logger.error("\nConfiguration Error. Please check:");
        logger.error("1. GROQ_API_KEY is set correctly");
        logger.error("2. GROQ_MODEL is set correctly (default: llama-3.3-70b-versatile)");
        logger.error("3. Visit https://console.groq.com/keys to get an API key\n");
      } else {
        logger.error("\nConfiguration Error. Please check:");
        logger.error("1. OLLAMA_URL is set correctly (default: http://127.0.0.1:11434)");
        logger.error("2. OLLAMA_MODEL exists on your Ollama installation");
        logger.error("3. Run 'ollama list' to see available models");
        logger.error("4. Run 'ollama pull <model>' to install a model\n");
      }
    }
    process.exit(1);
  }
}

start();
