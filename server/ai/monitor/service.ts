/**
 * AI Monitor Service — creates a request-scoped metadata collector.
 *
 * This service provides the `createAIMonitor()` factory which returns
 * a collector object. Each subsystem (context builder, memory retrieval,
 * RAG retrieval, tool executor, provider wrapper) calls methods on
 * this collector to append metadata.
 *
 * Phase 7.4 (Part 8): the monitor now also records Security telemetry
 * (input filter, output filter, blocked requests, rejected files, prompt
 * injection attempts, rate-limited requests) without ever storing sensitive
 * user data.
 *
 * No global state, no singleton state, no static variables.
 * Metadata is request-scoped only.
 */

import type {
  AIMonitorData,
  ConversationMode,
  MemoryMetadata,
  RagMetadata,
  ToolMetadata,
  ProviderMetadata,
  SecurityMetadata,
} from "./types";

/**
 * Collector interface exposed to subsystems.
 * Each subsystem calls the appropriate record* method.
 */
export interface AIMonitorCollector {
  /** Set the conversation mode. */
  setMode(mode: ConversationMode): void;
  /** Record memory retrieval metadata. */
  recordMemory(meta: MemoryMetadata): void;
  /** Record RAG retrieval metadata. */
  recordRag(meta: RagMetadata): void;
  /** Record tool execution metadata. */
  recordTool(meta: ToolMetadata): void;
  /** Record security telemetry (Phase 7.4, Part 8). */
  recordSecurity(meta: SecurityMetadata): void;
  /** Mark the request as ended (captures end timestamp). */
  end(): void;
  /** Get the finalised monitor data. */
  getData(): AIMonitorData;
}

/**
 * Create a new request-scoped AI Monitor collector.
 *
 * @param providerName - The provider that answered (e.g. "groq", "gemini", "ollama").
 * @param modelName - The actual model name that answered (e.g. "llama-3.3-70b-versatile").
 * @returns An AIMonitorCollector for the current request.
 */
export function createAIMonitor(
  providerName: string,
  modelName: string,
): AIMonitorCollector {
  const startTime = performance.now();

  const provider: ProviderMetadata = {
    name: providerName,
    model: modelName,
  };

  let mode: ConversationMode = "chat";
  let memory: MemoryMetadata | undefined;
  let rag: RagMetadata | undefined;
  let tools: ToolMetadata | undefined;
  let security: SecurityMetadata | undefined;
  let ended = false;
  let endTime = 0;

  const collector: AIMonitorCollector = {
    setMode(newMode: ConversationMode): void {
      mode = newMode;
    },

    recordMemory(meta: MemoryMetadata): void {
      memory = meta;
    },

    recordRag(meta: RagMetadata): void {
      rag = meta;
    },

    recordTool(meta: ToolMetadata): void {
      tools = meta;
    },

    recordSecurity(meta: SecurityMetadata): void {
      security = meta;
    },

    end(): void {
      if (!ended) {
        endTime = performance.now();
        ended = true;
      }
    },

    getData(): AIMonitorData {
      // Auto-end if not already ended
      if (!ended) {
        endTime = performance.now();
        ended = true;
      }

      return {
        provider,
        latencyMs: Math.round(endTime - startTime),
        mode,
        memory: memory && memory.entryCount > 0 ? memory : undefined,
        rag: rag && rag.chunkCount > 0 ? rag : undefined,
        tools: tools && tools.executionCount > 0 ? tools : undefined,
        security,
      };
    },
  };

  return collector;
}