/**
 * Shared domain types consumed by both the backend and the frontend.
 *
 * This module is the single source of truth for the public API contract
 * (request/response shapes) and the cross-cutting domain models that both
 * layers must agree on (persona, map actions, conversation messages).
 *
 * Server-only types (Ollama wire types, provider interfaces) live in
 * `server/ai/types.ts` and re-export the shared types from here.
 * Client-only types (Firestore entities, Web Speech API) live in
 * `src/types.ts` and import from here.
 */

/** Travel modes supported by the directions map action. */
export type TravelMode = "WALKING" | "DRIVING" | "BICYCLING" | "TRANSIT";

/** Kind of map action returned by the assistant. */
export type MapActionType = "search" | "directions" | "none";

/** Conversation author role. */
export type ConversationRole = "user" | "assistant";

/** Direction details produced by the assistant for routing. */
export interface MapDirections {
  origin: string;
  destination: string;
  travelMode: TravelMode;
}

/**
 * Map action instruction returned by the assistant for the
 * OpenStreetMap + Leaflet integration.
 */
export interface MapAction {
  type: MapActionType;
  /** Present when `type === "search"`. */
  query?: string;
  /** Present when `type === "directions"`. */
  directions?: MapDirections;
}

/**
 * User personality and preference data.
 * Passed to the system prompt to personalize responses. All fields are
 * optional because partial profiles are valid (e.g. guest users, new accounts).
 */
export interface Persona {
  personality?: string;
  preferences?: string;
  likes?: string;
  dislikes?: string;
  experiences?: string;
}

/** A single message in the conversation history exchanged with the API. */
export interface ConversationMessage {
  role: ConversationRole;
  text: string;
}

/** A document attached to a chat message. */
export interface ChatAttachment {
  documentId: string;
  filename: string;
}

/**
 * AI Monitor data returned alongside the chat response.
 * This is the frontend-facing shape of the metadata object.
 */
export interface AIMonitorDataDTO {
  /** Provider name (e.g. "Groq", "Gemini", "Ollama"). */
  provider: string;
  /** Model name (e.g. "llama-3.3-70b-versatile"). */
  model: string;
  /** Total request duration in milliseconds. */
  latencyMs: number;
  /** Human-readable conversation mode. */
  mode: string;
  /** Memory metadata (undefined if memory was not used). */
  memory?: {
    entryCount: number;
    avgConfidence: number;
  };
  /** RAG metadata (undefined if RAG was not used). */
  rag?: {
    activeDocCount: number;
    chunkCount: number;
  };
  /** Tool metadata (undefined if no tools were executed). */
  tools?: {
    executionCount: number;
    toolNames: string[];
  };
}

/** Request body for `POST /api/chat`. */
export interface ChatRequest {
  text: string;
  conversationId?: string;
  history?: ConversationMessage[];
  persona?: Persona;
  attachments?: ChatAttachment[];
}

/** Response body for `POST /api/chat`. */
export interface ChatResponse {
  replyText: string;
  mapAction: MapAction;
  searchSources?: string[];
  /** AI Monitor metadata for the request (undefined for legacy responses). */
  aiMonitor?: AIMonitorDataDTO;
}

/** Request body for `POST /api/summarize`. */
export interface SummaryRequest {
  messages: ConversationMessage[];
}

/** Response body for `POST /api/summarize`. */
export interface SummaryResponse {
  summary: string;
}