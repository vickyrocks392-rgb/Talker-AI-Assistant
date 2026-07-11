/**
 * Gemini API provider.
 * Implements the AIProvider interface using Google's Gemini API.
 * Supports both streaming and non-streaming responses.
 *
 * Note: This is a minimal implementation for failover support.
 * The Gemini API uses a different format, so we adapt it to the
 * AIProvider interface which expects Ollama-style response shapes.
 */

import { getConfig } from "../config/env";
import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import {
  OllamaMessage,
  OllamaResponse,
  OllamaStreamChunk,
  AIProvider,
} from "./types";

const logger = createLogger("GeminiProvider");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Convert Ollama-style messages to Gemini format.
 */
function convertToGeminiFormat(messages: OllamaMessage[]): { role: string; parts: { text: string }[] }[] {
  return messages.map((msg) => {
    // Gemini uses "user" and "model" roles
    const role = msg.role === "assistant" ? "model" : "user";
    return {
      role,
      parts: [{ text: msg.content }],
    };
  });
}

/**
 * Convert Gemini response to Ollama-style response.
 */
function convertFromGeminiResponse(data: {
  candidates: { content: { parts: { text: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}): OllamaResponse {
  const content = data.candidates[0]?.content?.parts[0]?.text ?? "";
  
  return {
    model: "gemini",
    created_at: new Date().toISOString(),
    message: {
      role: "assistant",
      content,
    },
    done: true,
    done_reason: data.candidates[0]?.finishReason ?? "stop",
    prompt_eval_count: data.usageMetadata?.promptTokenCount,
    eval_count: data.usageMetadata?.candidatesTokenCount,
  };
}

/**
 * Convert Gemini stream chunk to Ollama-style stream chunk.
 */
function convertFromGeminiStreamChunk(chunk: {
  candidates?: { content: { parts: { text: string }[] }; finishReason?: string }[];
}): OllamaStreamChunk {
  const content = chunk.candidates?.[0]?.content?.parts[0]?.text ?? "";
  const finishReason = chunk.candidates?.[0]?.finishReason;
  
  return {
    model: "gemini",
    created_at: new Date().toISOString(),
    message: {
      role: "assistant",
      content,
    },
    done: finishReason !== null && finishReason !== undefined,
    done_reason: finishReason ?? undefined,
  };
}

/**
 * Gemini provider implementation.
 * Adapts the Gemini API to the AIProvider interface.
 */
export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private modelName: string;

  constructor() {
    const config = getConfig().gemini;
    this.apiKey = config.apiKey;
    this.modelName = config.modelName;
  }

  /**
   * Send a non-streaming chat request to Gemini.
   */
  async chat(request: {
    messages: OllamaMessage[];
    temperature?: number;
    stream?: boolean;
  }): Promise<OllamaResponse> {
    const geminiMessages = convertToGeminiFormat(request.messages);

    const payload = {
      contents: geminiMessages,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        responseMimeType: "application/json",
      },
    };

    logger.debug(`Chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
      temperature: payload.generationConfig.temperature,
    });

    return withRetry(async () => {
      const url = `${GEMINI_API_BASE}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: Error & { status?: number } = new Error(
          `Gemini API error ${response.status}: ${errorText}`,
        );
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      const adapted = convertFromGeminiResponse(data);

      logger.debug("Chat response received", {
        contentLength: adapted.message.content.length,
        done: adapted.done,
      });

      return adapted;
    });
  }

  /**
   * Stream a chat response from Gemini.
   * Yields tokens progressively as they are generated.
   */
  async *chatStream(request: {
    messages: OllamaMessage[];
    temperature?: number;
  }): AsyncGenerator<OllamaStreamChunk> {
    const geminiMessages = convertToGeminiFormat(request.messages);

    const payload = {
      contents: geminiMessages,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        responseMimeType: "application/json",
      },
    };

    logger.debug(`Stream chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
    });

    try {
      const url = `${GEMINI_API_BASE}/models/${this.modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming request");
      }

      // Read streaming response (SSE format)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          // Skip empty lines and SSE comments
          if (!line || line.startsWith(":")) continue;

          // Check for data: prefix
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);

            try {
              const geminiChunk = JSON.parse(dataStr);
              const adapted = convertFromGeminiStreamChunk(geminiChunk);
              yield adapted;
            } catch (e) {
              logger.warn("Failed to parse streaming JSON", { line: dataStr });
            }
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          try {
            const geminiChunk = JSON.parse(dataStr);
            const adapted = convertFromGeminiStreamChunk(geminiChunk);
            yield adapted;
          } catch (e) {
            logger.warn("Failed to parse final streaming JSON", { buffer });
          }
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
      const geminiMessages = convertToGeminiFormat(messages);
      
      const url = `${GEMINI_API_BASE}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.candidates[0]?.content?.parts[0]?.text ?? "";
    });
  }
}

/**
 * Create and return the singleton Gemini provider.
 */
let provider: GeminiProvider | null = null;

export function getGeminiProvider(): GeminiProvider {
  if (!provider) {
    provider = new GeminiProvider();
  }
  return provider;
}