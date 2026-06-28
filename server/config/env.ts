/**
 * Centralised, typed configuration loaded from the environment at startup.
 *
 * Every module that needs process.env reads it through this single module.
 * Required variables are validated eagerly when getConfig() is first called.
 */

import dotenv from "dotenv";
import { ConfigError } from "../utils/errors";

// Load .env as early as possible — before any module calls getConfig()
dotenv.config();

// ── Public configuration shape ──────────────────────────────────────

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export interface OllamaConfig {
  baseUrl: string;
  modelName: string;
}

export interface GroqConfig {
  apiKey: string;
  modelName: string;
}

export interface ViteDevConfig {
  hmrPort: number | undefined;
  disableHmr: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  aiProvider: "ollama" | "groq";
  ollama: OllamaConfig;
  groq: GroqConfig;
  vite: ViteDevConfig;
}

// ── Singleton loader ────────────────────────────────────────────────

let cached: AppConfig | null = null;

function loadConfig(): AppConfig {
  // --- Server ---
  const rawPort = process.env.PORT || "3000";
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ConfigError(
      `Invalid PORT: "${rawPort}". Must be a number between 1 and 65535.`,
    );
  }

  const nodeEnv = process.env.NODE_ENV || "development";

  // --- AI Provider ---
  const aiProviderRaw = process.env.AI_PROVIDER || "ollama";
  if (aiProviderRaw !== "ollama" && aiProviderRaw !== "groq") {
    throw new ConfigError(
      `Invalid AI_PROVIDER: "${aiProviderRaw}". Must be "ollama" or "groq".`,
    );
  }
  const aiProvider = aiProviderRaw as "ollama" | "groq";

  // --- Ollama ---
  const baseUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  const modelName = process.env.OLLAMA_MODEL || "llama3.2:3b";

  // --- Groq ---
  const groqApiKey = process.env.GROQ_API_KEY || "";
  const groqModelName = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  // --- Vite dev-server ---
  const hmrPortStr = process.env.HMR_PORT;
  const hmrPort = hmrPortStr ? parseInt(hmrPortStr, 10) : undefined;
  const disableHmr = process.env.DISABLE_HMR === "true";

  return {
    server: {
      port,
      nodeEnv,
      isProduction: nodeEnv === "production",
      isDevelopment: nodeEnv !== "production",
    },
    aiProvider,
    ollama: { baseUrl, modelName },
    groq: { apiKey: groqApiKey, modelName: groqModelName },
    vite: { hmrPort, disableHmr },
  };
}

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}