/**
 * Native Ollama API provider.
 * Implements the AIProvider interface using Ollama's /api/chat endpoint.
 * Supports both streaming and non-streaming responses.
 */

import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import {
  OllamaChatRequest,
  OllamaMessage,
  OllamaResponse,
  OllamaStreamChunk,
  AIProvider,
} from "./types";
import { getActiveModel, getOllamaBaseUrl } from "./config";

const logger = createLogger("OllamaProvider");

/**
 * Ollama provider implementation.
 * All communication through native /api/chat endpoint.
 */
class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private modelName: string;

  constructor() {
    this.baseUrl = getOllamaBaseUrl();
    this.modelName = getActiveModel().name;
  }

  /**
   * Send a non-streaming chat request to Ollama.
   * Returns a single complete response.
   */
  async chat(request: {
    messages: OllamaMessage[];
    temperature?: number;
    stream?: boolean;
  }): Promise<OllamaResponse> {
    const payload: OllamaChatRequest = {
      model: this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      stream: false, // Force non-streaming
      format: "json",
    };

    logger.debug(`Chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
      temperature: payload.temperature,
    });

    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: Error & { status?: number } = new Error(
          `Ollama API error ${response.status}: ${errorText}`,
        );
        error.status = response.status;
        throw error;
      }

      const data = (await response.json()) as OllamaResponse;
      logger.debug("Chat response received", {
        contentLength: data.message.content.length,
        done: data.done,
      });

      return data;
    });
  }

  /**
   * Stream a chat response from Ollama.
   * Yields tokens progressively as they are generated.
   * 
   * Note: This is an async generator that yields OllamaStreamChunk objects.
   * The client should listen to these and display them in real-time.
   */
  async *chatStream(request: {
    messages: OllamaMessage[];
    temperature?: number;
  }): AsyncGenerator<OllamaStreamChunk> {
    const payload: OllamaChatRequest = {
      model: this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      stream: true, // Enable streaming
      format: "json",
    };

    logger.debug(`Stream chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming request");
      }

      // Read streaming response line by line
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON objects from buffer
        const lines = buffer.split("\n");
        buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;
            yield chunk;
          } catch (e) {
            logger.warn("Failed to parse streaming JSON", { line });
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as OllamaStreamChunk;
          yield chunk;
        } catch (e) {
          logger.warn("Failed to parse final streaming JSON", { buffer });
        }
      }
    } catch (error) {
      logger.error("Stream error", error);
      throw error;
    }
  }

  /**
   * Create a summary of messages by prompting the model.
   * Used for conversation session titles.
   */
  async summarize(messages: OllamaMessage[]): Promise<string> {
    logger.debug("Summarizing conversation", {
      messageCount: messages.length,
    });

    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          temperature: 0.5,
          stream: false,
          format: "json",
        } as OllamaChatRequest),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error ${response.status}`);
      }

      const data = (await response.json()) as OllamaResponse;
      return data.message.content;
    });
  }
}

/**
 * Create and return the singleton Ollama provider.
 */
let provider: OllamaProvider | null = null;

export function getOllamaProvider(): OllamaProvider {
  if (!provider) {
    provider = new OllamaProvider();
  }
  return provider;
}
