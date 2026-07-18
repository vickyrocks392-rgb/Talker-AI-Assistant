/**
 * Type definitions for the AI Monitor subsystem.
 *
 * The AI Monitor is a request-scoped metadata collector that tracks
 * what happened during a chat request lifecycle:
 *   - which provider answered
 *   - which model answered
 *   - whether memory was used
 *   - whether RAG was used
 *   - whether tools executed
 *   - how long the request took
 *   - security telemetry (Phase 7.4, Part 8)
 *
 * This is NOT an observability platform. It is a lightweight metadata
 * object that travels through the request lifecycle and is returned
 * alongside the response for frontend display.
 */

/**
 * Conversation mode describing which subsystems were active.
 */
export type ConversationMode =
  | "chat"           // Chat Only — no memory, no RAG, no tools
  | "memory"         // Memory only
  | "rag"            // RAG only
  | "memory+rag"     // Memory + RAG
  | "tool"           // Tool Mode
  | "hybrid";        // Memory + RAG + Tools

/**
 * Memory metadata captured during the request.
 */
export interface MemoryMetadata {
  /** Number of memory entries retrieved (hit count). */
  entryCount: number;
  /** Average confidence score of retrieved entries (0–1). */
  avgConfidence: number;
}

/**
 * RAG (retrieval) metadata captured during the request.
 */
export interface RagMetadata {
  /** Number of active documents used for retrieval. */
  activeDocCount: number;
  /** Number of chunks retrieved from the vector store. */
  chunkCount: number;
}

/**
 * Tool execution metadata captured during the request.
 */
export interface ToolMetadata {
  /** Number of tools executed. */
  executionCount: number;
  /** Names of tools that were executed. */
  toolNames: string[];
}

/**
 * Security telemetry captured during the request (Phase 7.4, Part 8).
 * Contains ONLY non-sensitive counters and labels.
 */
export interface SecurityMetadata {
  /** True if any security layer intervened. */
  triggered: boolean;
  /** Input filter disposition. */
  inputDecision: "allow" | "warn" | "redact" | "block";
  /** Output filter disposition. */
  outputDecision: "allow" | "warn" | "redact" | "block";
  /** Number of prompt-injection attempts detected. */
  promptInjectionAttempts: number;
  /** Number of files rejected. */
  rejectedFiles: number;
  /** True if the request was rate-limited. */
  rateLimited: boolean;
}

/**
 * Provider metadata captured during the request.
 */
export interface ProviderMetadata {
  /** The provider that answered (e.g. "groq", "gemini", "ollama"). */
  name: string;
  /** The actual model name that answered. */
  model: string;
}

/**
 * Complete AI Monitor data for a single request.
 *
 * This object is request-scoped only. It is created at the start of
 * a request, populated by each subsystem, and returned alongside
 * the response.
 */
export interface AIMonitorData {
  /** The provider that answered. */
  provider: ProviderMetadata;
  /** Total request duration in milliseconds. */
  latencyMs: number;
  /** The conversation mode determined by the orchestrator. */
  mode: ConversationMode;
  /** Memory metadata (undefined if memory was not used). */
  memory?: MemoryMetadata;
  /** RAG metadata (undefined if RAG was not used). */
  rag?: RagMetadata;
  /** Tool metadata (undefined if no tools were executed). */
  tools?: ToolMetadata;
  /** Security telemetry (undefined if no security events). */
  security?: SecurityMetadata;
}