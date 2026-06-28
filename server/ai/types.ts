/**
 * Backend-specific TypeScript interfaces for the Talker AI server.
 *
 * Shared domain and API contract types (Persona, ConversationMessage,
 * MapAction, ChatRequest/Response, SummaryRequest/Response) live in
 * `shared/types.ts` and are re-exported here so existing import paths
 * (`from "./types"`, `from "../ai/types"`) keep working.
 *
 * This module only declares server-internal types: provider wire formats,
 * the AIProvider abstraction, model configuration, and parsed model output.
 */

// Re-export shared types so backend modules can import them from a single path.
export type {
  Persona,
  ConversationMessage,
  ConversationRole,
  MapAction,
  MapActionType,
  MapDirections,
  TravelMode,
  ChatRequest,
  ChatResponse,
  SummaryRequest,
  SummaryResponse,
} from "../../shared/types";

import type { MapAction } from "../../shared/types";

/**
 * Message format for the Ollama API.
 */
export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Native Ollama API request body.
 * See: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: string | object;
  temperature?: number;
  top_k?: number;
  top_p?: number;
}

/**
 * Native Ollama API response (non-streaming).
 */
export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * A single chunk from an Ollama streaming response (`stream: true`).
 * Structurally identical to a non-streaming response, emitted repeatedly.
 */
export type OllamaStreamChunk = OllamaResponse;

/**
 * Groq API chat completion request body.
 * See: https://console.groq.com/docs/api-reference#chat
 */
export interface GroqChatRequest {
  model: string;
  messages: OllamaMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  response_format?: { type: "json_object" };
}

/**
 * Groq API chat completion response (non-streaming).
 */
export interface GroqResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: OllamaMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * A single chunk from a Groq streaming response.
 */
export interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<OllamaMessage>;
    finish_reason: string | null;
  }[];
}

/**
 * Interface for AI providers (Ollama, Groq, and future providers).
 * Allows the backend to support multiple providers without route changes.
 */
export interface AIProvider {
  chat(request: {
    messages: OllamaMessage[];
    temperature?: number;
    stream?: boolean;
  }): Promise<OllamaResponse>;

  chatStream(request: {
    messages: OllamaMessage[];
    temperature?: number;
  }): AsyncGenerator<OllamaStreamChunk>;

  summarize(messages: OllamaMessage[]): Promise<string>;
}

/** Configuration for a supported model. */
export interface ModelConfig {
  provider: "ollama" | "groq";
  name: string;
  contextLength?: number;
}

/** Parsed chat response from the model. */
export interface ModelResponseParsed {
  replyText: string;
  mapAction: MapAction;
}