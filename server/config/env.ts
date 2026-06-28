/**
 * Centralised, typed configuration loaded from the environment at startup.
 *
 * Every module that needs process.env reads it through this single module.
 * Required variables are validated eagerly when getConfig() is first called.
 */

import { ConfigError } from "../utils/errors";

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

export interface ViteDevConfig {
  hmrPort: number | undefined;
  disableHmr: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  ollama: OllamaConfig;
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

  // --- Ollama ---
  const baseUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  const modelName = process.env.OLLAMA_MODEL || "llama3.2:3b";

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
    ollama: { baseUrl, modelName },
    vite: { hmrPort, disableHmr },
  };
}

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
