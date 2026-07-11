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
import { getFailoverProvider, resetFailoverProvider } from "./failover";

const logger = createLogger("ProviderFactory");

let cachedProvider: AIProvider | null = null;

/**
 * Return the singleton AI provider instance.
 *
 * If AI_FAILOVER_ENABLED is true (default), returns a FailoverProvider that
 * automatically tries multiple providers in priority order with health tracking
 * and exponential backoff.
 *
 * Otherwise, returns the provider specified by AI_PROVIDER env var:
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
  const failoverEnabled = process.env.AI_FAILOVER_ENABLED !== "false";

  // Use failover provider if enabled
  if (failoverEnabled) {
    logger.info("Initialising AI provider with failover support");
    cachedProvider = getFailoverProvider();
    return cachedProvider;
  }

  // Legacy single-provider mode
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
  resetFailoverProvider();
}
