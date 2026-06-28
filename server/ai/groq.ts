/**
 * Groq API provider.
 * Implements the AIProvider interface using Groq's chat completions API.
 * Supports both streaming and non-streaming responses.
 *
 * Groq uses an OpenAI-compatible API format, so we adapt it to the
 * AIProvider interface which expects Ollama-style response shapes.
 */

import { getConfig } from "../config/env";
import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import {
  OllamaMessage,
  OllamaResponse,
  OllamaStreamChunk,
  GroqChatRequest,
  GroqResponse,
  GroqStreamChunk,
  AIProvider,
} from "./types";

const logger = createLogger("GroqProvider");

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

/**
 * Groq provider implementation.
 * Adapts the OpenAI-compatible Groq API to the AIProvider interface.
 */
export class GroqProvider implements AIProvider {
  private apiKey: string;
  private modelName: string;

  constructor() {
    const config = getConfig().groq;
    this.apiKey = config.apiKey;
    this.modelName = config.modelName;
  }

  /**
   * Send a non-streaming chat request to Groq.
   * Returns a response shaped like OllamaResponse for interface compatibility.
   */
  async chat(request: {
    messages: OllamaMessage[];
    temperature?: number;
    stream?: boolean;
  }): Promise<OllamaResponse> {
    const payload: GroqChatRequest = {
      model: this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      stream: false,
      response_format: { type: "json_object" },
    };

    logger.debug(`Chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
      temperature: payload.temperature,
    });

    return withRetry(async () => {
      const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: Error & { status?: number } = new Error(
          `Groq API error ${response.status}: ${errorText}`,
        );
        error.status = response.status;
        throw error;
      }

      const data = (await response.json()) as GroqResponse;

      // Adapt Groq response to OllamaResponse shape
      const adapted: OllamaResponse = {
        model: data.model,
        created_at: new Date(data.created * 1000).toISOString(),
        message: data.choices[0]?.message ?? {
          role: "assistant",
          content: "",
        },
        done: true,
        done_reason: data.choices[0]?.finish_reason ?? "stop",
        prompt_eval_count: data.usage?.prompt_tokens,
        eval_count: data.usage?.completion_tokens,
      };

      logger.debug("Chat response received", {
        contentLength: adapted.message.content.length,
        done: adapted.done,
      });

      return adapted;
    });
  }

  /**
   * Stream a chat response from Groq.
   * Yields tokens progressively as they are generated.
   * Adapts Groq stream chunks to OllamaStreamChunk shape.
   */
  async *chatStream(request: {
    messages: OllamaMessage[];
    temperature?: number;
  }): AsyncGenerator<OllamaStreamChunk> {
    const payload: GroqChatRequest = {
      model: this.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      stream: true,
      response_format: { type: "json_object" },
    };

    logger.debug(`Stream chat request to ${this.modelName}`, {
      messageCount: request.messages.length,
    });

    try {
      const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
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

            // Groq sends "[DONE]" to signal stream end
            if (dataStr === "[DONE]") {
              continue;
            }

            try {
              const groqChunk = JSON.parse(dataStr) as GroqStreamChunk;

              // Adapt Groq stream chunk to OllamaStreamChunk shape
              const adapted: OllamaStreamChunk = {
                model: groqChunk.model,
                created_at: new Date(groqChunk.created * 1000).toISOString(),
                message: {
                  role: groqChunk.choices[0]?.delta?.role ?? "assistant",
                  content: groqChunk.choices[0]?.delta?.content ?? "",
                },
                done: groqChunk.choices[0]?.finish_reason !== null,
                done_reason: groqChunk.choices[0]?.finish_reason ?? undefined,
              };

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
          if (dataStr !== "[DONE]") {
            try {
              const groqChunk = JSON.parse(dataStr) as GroqStreamChunk;
              const adapted: OllamaStreamChunk = {
                model: groqChunk.model,
                created_at: new Date(groqChunk.created * 1000).toISOString(),
                message: {
                  role: groqChunk.choices[0]?.delta?.role ?? "assistant",
                  content: groqChunk.choices[0]?.delta?.content ?? "",
                },
                done: groqChunk.choices[0]?.finish_reason !== null,
                done_reason: groqChunk.choices[0]?.finish_reason ?? undefined,
              };
              yield adapted;
            } catch (e) {
              logger.warn("Failed to parse final streaming JSON", { buffer });
            }
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
      const response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          temperature: 0.5,
          stream: false,
          response_format: { type: "json_object" },
        } as GroqChatRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as GroqResponse;
      return data.choices[0]?.message?.content ?? "";
    });
  }
}