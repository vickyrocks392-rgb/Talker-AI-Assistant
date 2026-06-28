/**
 * Model registry and active-model resolution for Talker AI.
 *
 * The model name / Ollama URL come from the centralised environment config
 * (`server/config/env.ts`).  This module validates the model name against
 * the known registry and resolves its configuration (provider, context length).
 *
 * To add a new model:
 *   1. Install it:  ollama pull <modelname>
 *   2. Add an entry to the MODELS map below
 *   3. Set OLLAMA_MODEL=<modelname> in your environment (or rely on the default)
 *   4. Restart the server
 */

import { getConfig } from "../config/env";
import { ConfigError } from "../utils/errors";
import type { ModelConfig } from "./types";

/**
 * Supported models registry.
 * The DEFAULT_MODEL constant below acts as the fallback when
 * the OLLAMA_MODEL environment variable is not set.
 */
const DEFAULT_MODEL = "llama3.2:3b";

const MODELS: Record<string, ModelConfig> = {
  "llama3.1:8b": { provider: "ollama", name: "llama3.1:8b", contextLength: 8192 },
  "llama3.2:3b": { provider: "ollama", name: "llama3.2:3b", contextLength: 8192 },
  "qwen3:4b":    { provider: "ollama", name: "qwen3:4b",    contextLength: 32768 },
  gemma3:        { provider: "ollama", name: "gemma3",      contextLength: 8192 },
};

/**
 * Return the configuration for the active model.
 *
 * The model name is resolved from:
 *   1. The `OLLAMA_MODEL` environment variable, or
 *   2. `DEFAULT_MODEL` ("llama3.2:3b")
 *
 * @throws {ConfigError} if the resolved model name is not in the registry.
 */
export function getActiveModel(): ModelConfig {
  const { modelName } = getConfig().ollama;
  const resolved = modelName || DEFAULT_MODEL;

  const model = MODELS[resolved];
  if (!model) {
    throw new ConfigError(
      `Unknown model: "${resolved}". Supported: ${Object.keys(MODELS).join(", ")}.`,
    );
  }

  return model;
}

/**
 * Return the base URL of the Ollama server (e.g. `http://127.0.0.1:11434`).
 */
export function getOllamaBaseUrl(): string {
  return getConfig().ollama.baseUrl;
}