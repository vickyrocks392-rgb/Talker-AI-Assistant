/**
 * AI Provider Failover Orchestration Layer.
 *
 * Provides automatic failover between multiple AI providers with:
 * - Provider priority ordering
 * - Health tracking (5-minute cooldown after repeated failures)
 * - Exponential backoff between provider attempts
 * - Structured logging for observability
 *
 * This layer wraps individual providers and presents the same AIProvider
 * interface, so ConversationService doesn't need to change.
 */

import { createLogger } from "../utils/logger";
import type { AIProvider, OllamaMessage, OllamaResponse, OllamaStreamChunk } from "./types";
import { GroqProvider } from "./groq";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";

const logger = createLogger("FailoverProvider");

// ── Configuration ───────────────────────────────────────────────────

/**
 * Provider priority order (highest to lowest).
 * Can be overridden via AI_PROVIDER_PRIORITY env var.
 */
const DEFAULT_PROVIDER_PRIORITY = ["groq", "gemini", "ollama"] as const;

/**
 * Health check cooldown period (5 minutes).
 * Providers that fail repeatedly will be skipped for this duration.
 */
const HEALTH_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Exponential backoff delays between provider attempts.
 */
const BACKOFF_DELAYS = [1000, 2000]; // 1s before 2nd provider, 2s before 3rd

// ── Types ───────────────────────────────────────────────────────────

type ProviderName = "groq" | "gemini" | "ollama";

interface ProviderHealth {
  provider: AIProvider;
  name: ProviderName;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  isHealthy: boolean;
}

// ── Failover Provider ───────────────────────────────────────────────

export class FailoverProvider implements AIProvider {
  private providers: Map<ProviderName, ProviderHealth>;
  private priority: ProviderName[];
  private failoverEnabled: boolean;

  constructor() {
    this.providers = new Map();
    this.priority = this.loadPriority();
    this.failoverEnabled = this.loadFailoverEnabled();

    // Initialize all providers
    this.initializeProviders();

    logger.info("Failover provider initialized", {
      priority: this.priority,
      failoverEnabled: this.failoverEnabled,
    });
  }

  /**
   * Load provider priority from environment variable.
   * Format: AI_PROVIDER_PRIORITY=groq,gemini,ollama
   */
  private loadPriority(): ProviderName[] {
    const envPriority = process.env.AI_PROVIDER_PRIORITY;
    if (!envPriority) {
      return [...DEFAULT_PROVIDER_PRIORITY];
    }

    const providers = envPriority.split(",").map((p) => p.trim().toLowerCase()) as ProviderName[];
    
    // Validate providers
    const validProviders = ["groq", "gemini", "ollama"] as const;
    const invalidProviders = providers.filter((p) => !validProviders.includes(p));
    
    if (invalidProviders.length > 0) {
      logger.warn(`Invalid providers in AI_PROVIDER_PRIORITY: ${invalidProviders.join(", ")}. Using default.`);
      return [...DEFAULT_PROVIDER_PRIORITY];
    }

    if (providers.length === 0) {
      logger.warn("AI_PROVIDER_PRIORITY is empty. Using default.");
      return [...DEFAULT_PROVIDER_PRIORITY];
    }

    logger.info(`Provider priority loaded from env: ${providers.join(" -> ")}`);
    return providers;
  }

  /**
   * Load failover enabled flag from environment.
   */
  private loadFailoverEnabled(): boolean {
    const envValue = process.env.AI_FAILOVER_ENABLED;
    if (envValue === undefined) {
      return true; // Default to enabled
    }
    return envValue.toLowerCase() === "true";
  }

  /**
   * Initialize all provider instances.
   */
  private initializeProviders(): void {
    // Initialize Groq
    try {
      const groqProvider = new GroqProvider();
      this.providers.set("groq", {
        provider: groqProvider,
        name: "groq",
        consecutiveFailures: 0,
        lastFailureTime: null,
        isHealthy: true,
      });
    } catch (error) {
      logger.error("Failed to initialize Groq provider", error);
    }

    // Initialize Gemini
    try {
      const geminiProvider = new GeminiProvider();
      this.providers.set("gemini", {
        provider: geminiProvider,
        name: "gemini",
        consecutiveFailures: 0,
        lastFailureTime: null,
        isHealthy: true,
      });
    } catch (error) {
      logger.error("Failed to initialize Gemini provider", error);
    }

    // Initialize Ollama
    try {
      const ollamaProvider = new OllamaProvider();
      this.providers.set("ollama", {
        provider: ollamaProvider,
        name: "ollama",
        consecutiveFailures: 0,
        lastFailureTime: null,
        isHealthy: true,
      });
    } catch (error) {
      logger.error("Failed to initialize Ollama provider", error);
    }

    const initializedCount = this.providers.size;
    logger.info(`Initialized ${initializedCount}/3 providers`);
  }

  /**
   * Check if a provider is healthy and can be used.
   * A provider is unhealthy if it has failed 3+ times within the cooldown period.
   */
  private isProviderHealthy(health: ProviderHealth): boolean {
    if (!health.isHealthy) {
      return false;
    }

    // If provider has consecutive failures, check cooldown
    if (health.consecutiveFailures >= 3 && health.lastFailureTime) {
      const timeSinceFailure = Date.now() - health.lastFailureTime;
      if (timeSinceFailure < HEALTH_COOLDOWN_MS) {
        return false;
      }
      // Cooldown expired, reset health
      logger.info(`Provider ${health.name} cooldown expired, resetting health`);
      health.consecutiveFailures = 0;
      health.lastFailureTime = null;
      health.isHealthy = true;
    }

    return true;
  }

  /**
   * Mark a provider as failed.
   */
  private markProviderFailed(health: ProviderHealth): void {
    health.consecutiveFailures++;
    health.lastFailureTime = Date.now();

    if (health.consecutiveFailures >= 3) {
      health.isHealthy = false;
      logger.warn(`Provider ${health.name} marked as unhealthy after ${health.consecutiveFailures} failures`);
    }
  }

  /**
   * Mark a provider as successful (reset failure count).
   */
  private markProviderSuccess(health: ProviderHealth): void {
    if (health.consecutiveFailures > 0) {
      logger.info(`Provider ${health.name} restored to healthy state`);
    }
    health.consecutiveFailures = 0;
    health.lastFailureTime = null;
    health.isHealthy = true;
  }

  /**
   * Get the next available provider in the priority list.
   */
  private getNextProvider(currentIndex: number): { provider: AIProvider; name: ProviderName; index: number } | null {
    for (let i = currentIndex + 1; i < this.priority.length; i++) {
      const providerName = this.priority[i];
      const health = this.providers.get(providerName);

      if (health && this.isProviderHealthy(health)) {
        return {
          provider: health.provider,
          name: providerName,
          index: i,
        };
      }
    }

    return null;
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a request with failover logic.
   */
  private async executeWithFailover<T>(
    operation: (provider: AIProvider, providerName: ProviderName) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    // If failover is disabled, use only the first provider
    if (!this.failoverEnabled) {
      const firstProviderName = this.priority[0];
      const firstHealth = this.providers.get(firstProviderName);
      
      if (firstHealth && this.isProviderHealthy(firstHealth)) {
        try {
          const result = await operation(firstHealth.provider, firstProviderName);
          this.markProviderSuccess(firstHealth);
          return result;
        } catch (error) {
          this.markProviderFailed(firstHealth);
          throw error;
        }
      }
      
      throw new Error(`Primary provider ${firstProviderName} is unavailable`);
    }

    // Try each provider in priority order
    let lastError: Error | null = null;

    for (let i = 0; i < this.priority.length; i++) {
      const providerName = this.priority[i];
      const health = this.providers.get(providerName);

      if (!health || !this.isProviderHealthy(health)) {
        logger.warn(`Skipping unhealthy provider: ${providerName}`);
        continue;
      }

      try {
        logger.info(`Attempting ${operationName} with ${providerName}`);
        const result = await operation(health.provider, providerName);
        
        // Success - mark provider as healthy
        this.markProviderSuccess(health);
        
        // If we used a fallback provider, log it
        if (i > 0) {
          logger.info(`[INFO] Fallback successful using ${providerName}`);
        }
        
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Mark provider as failed
        this.markProviderFailed(health);

        // Log the failure
        const errorMessage = err.message.toLowerCase();
        let reason = "unknown error";
        
        if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
          reason = "rate limit exceeded";
        } else if (errorMessage.includes("timeout") || errorMessage.includes("etimedout")) {
          reason = "network timeout";
        } else if (errorMessage.includes("5xx") || errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503")) {
          reason = "server error";
        } else if (errorMessage.includes("unavailable") || errorMessage.includes("econnrefused")) {
          reason = "provider unavailable";
        }

        logger.warn(`[WARN] ${providerName} failed with ${reason}, ${this.getNextProviderMessage(i)}`);

        // Try next provider
        const nextProvider = this.getNextProvider(i);
        if (nextProvider) {
          // Apply exponential backoff
          const backoffIndex = Math.min(i, BACKOFF_DELAYS.length - 1);
          const delay = BACKOFF_DELAYS[backoffIndex];
          
          logger.debug(`Waiting ${delay}ms before attempting ${nextProvider.name}`);
          await this.sleep(delay);
        }
      }
    }

    // All providers failed
    const failedProviders = this.priority
      .map((name) => {
        const health = this.providers.get(name);
        return health && !this.isProviderHealthy(health) ? name : null;
      })
      .filter((name): name is ProviderName => name !== null);

    logger.error(`All providers failed: ${failedProviders.join(", ")}`, lastError);
    throw new Error("All configured AI providers are currently unavailable.");
  }

  /**
   * Get message about next provider attempt.
   */
  private getNextProviderMessage(currentIndex: number): string {
    const nextProvider = this.getNextProvider(currentIndex);
    if (nextProvider) {
      return `attempting ${nextProvider.name}`;
    }
    return "no more providers available";
  }

  // ── AIProvider Interface Implementation ───────────────────────────

  async chat(request: {
    messages: OllamaMessage[];
    temperature?: number;
    stream?: boolean;
  }): Promise<OllamaResponse> {
    return this.executeWithFailover(
      async (provider, providerName) => {
        return provider.chat(request);
      },
      "chat request",
    );
  }

  async *chatStream(request: {
    messages: OllamaMessage[];
    temperature?: number;
  }): AsyncGenerator<OllamaStreamChunk> {
    logger.info("Active provider chain: " + this.priority.join(" -> "));

    // If failover is disabled, use only the first provider
    if (!this.failoverEnabled) {
      const firstProviderName = this.priority[0];
      const firstHealth = this.providers.get(firstProviderName);
      
      if (!firstHealth || !this.isProviderHealthy(firstHealth)) {
        throw new Error(`Primary provider ${firstProviderName} is unavailable`);
      }

      logger.info(`Streaming with ${firstProviderName} (failover disabled)`);

      try {
        // Stream from the selected provider
        for await (const chunk of firstHealth.provider.chatStream(request)) {
          yield chunk;
        }

        // Mark as successful
        this.markProviderSuccess(firstHealth);
      } catch (error) {
        // Mark as failed
        this.markProviderFailed(firstHealth);
        logger.error(`Streaming failed with ${firstProviderName}`, error);
        throw error;
      }
      return;
    }

    // Try each provider in priority order for streaming
    let lastError: Error | null = null;

    for (let i = 0; i < this.priority.length; i++) {
      const providerName = this.priority[i];
      const health = this.providers.get(providerName);

      if (!health || !this.isProviderHealthy(health)) {
        logger.warn(`Skipping unhealthy provider: ${providerName}`);
        continue;
      }

      logger.info(`Attempting streaming with ${providerName}`);

      try {
        // Stream from the provider and yield chunks
        const streamGenerator = health.provider.chatStream(request);
        let streamCompleted = false;

        for await (const chunk of streamGenerator) {
          yield chunk;
        }
        
        streamCompleted = true;

        // If we reach here, streaming completed successfully
        this.markProviderSuccess(health);

        // If we used a fallback provider, log it
        if (i > 0) {
          logger.info(`[INFO] Provider ${providerName} succeeded`);
        }

        return;
      } catch (error) {
        // Provider failed during streaming
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Mark provider as failed
        this.markProviderFailed(health);

        // Log the failure
        const errorMessage = err.message.toLowerCase();
        let reason = "unknown error";
        
        if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
          reason = "429";
        } else if (errorMessage.includes("timeout") || errorMessage.includes("etimedout")) {
          reason = "timeout";
        } else if (errorMessage.includes("5xx") || errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503")) {
          reason = "5xx";
        } else if (errorMessage.includes("unavailable") || errorMessage.includes("econnrefused")) {
          reason = "unavailable";
        }

        logger.warn(`[WARN] Provider ${providerName} failed with ${reason}`);

        // Try next provider
        const nextProvider = this.getNextProvider(i);
        if (nextProvider) {
          // Apply exponential backoff
          const backoffIndex = Math.min(i, BACKOFF_DELAYS.length - 1);
          const delay = BACKOFF_DELAYS[backoffIndex];
          
          logger.info(`[INFO] Attempting provider ${nextProvider.name}`);
          logger.debug(`Waiting ${delay}ms before attempting ${nextProvider.name}`);
          await this.sleep(delay);
        }

        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    const failedProviders = this.priority.filter(name => {
      const health = this.providers.get(name);
      return health && !this.isProviderHealthy(health);
    });

    logger.error(`All providers failed: ${failedProviders.join(", ")}`, lastError);
    throw new Error("All configured AI providers are currently unavailable.");
  }

  async summarize(messages: OllamaMessage[]): Promise<string> {
    return this.executeWithFailover(
      async (provider, providerName) => {
        return provider.summarize(messages);
      },
      "summarization",
    );
  }
}

// ── Singleton Instance ──────────────────────────────────────────────

let failoverProvider: FailoverProvider | null = null;

/**
 * Get the singleton FailoverProvider instance.
 * This replaces getAIProvider() in the provider factory.
 */
export function getFailoverProvider(): FailoverProvider {
  if (!failoverProvider) {
    failoverProvider = new FailoverProvider();
  }
  return failoverProvider;
}

/**
 * Reset the failover provider (useful for testing).
 */
export function resetFailoverProvider(): void {
  failoverProvider = null;
}