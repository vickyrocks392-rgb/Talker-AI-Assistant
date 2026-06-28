/**
 * AI Provider registry and factory.
 * Resolves the active provider based on the AI_PROVIDER environment variable.
 * All consumers should import from this module instead of directly from ollama.ts or groq.ts.
 */

import { getConfig } from "../config/env";
import { ConfigError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { AIProvider } from "./types";
import { OllamaProvider } from "./ollama";
import { GroqProvider } from "./groq";

const logger = createLogger("ProviderFactory");

let cachedProvider: AIProvider | null = null;

/**
 * Return the singleton AI provider instance based on the AI_PROVIDER env var.
 *
 * - "ollama" (default) → OllamaProvider
 * - "groq"            → GroqProvider
 *
 * @throws {ConfigError} if AI_PROVIDER is set to an unsupported value.
 */
export function getAIProvider(): AIProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const { aiProvider } = getConfig();
  logger.info(`Initialising AI provider: "${aiProvider}"`);

  switch (aiProvider) {
    case "ollama":
      cachedProvider = new OllamaProvider();
      break;
    case "groq":
      cachedProvider = new GroqProvider();
      break;
    default:
      throw new ConfigError(
        `Unsupported AI_PROVIDER: "${aiProvider}". Expected "ollama" or "groq".`,
      );
  }

  return cachedProvider;
}

/**
 * Reset the cached provider (useful for testing or config changes).
 */
export function resetProvider(): void {
  cachedProvider = null;
}