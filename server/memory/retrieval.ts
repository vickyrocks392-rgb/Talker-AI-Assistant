/**
 * Memory Retrieval Service — retrieves relevant global memory entries
 * for the current conversation context.
 *
 * This service is responsible for:
 *   1. Searching global memory for entries relevant to the current query
 *   2. Scoring entries for relevance confidence
 *   3. Determining if memory confidence is high enough to include
 *   4. Formatting memory context for injection into the LLM context
 *
 * Memory retrieval occurs BEFORE provider inference, and is completely
 * separate from document/RAG retrieval.
 *
 * Architecture:
 *   - Global Memory = user-scoped (shared across all conversations)
 *   - Conversation Memory = conversation-scoped (handled by loadHistory)
 *   - Current context always takes precedence over memory context
 */

import { memoryService } from "./service";
import { createLogger } from "../utils/logger";
import type { GlobalMemoryEntry } from "./types";

const logger = createLogger("MemoryRetrieval");

/**
 * Minimum confidence score (0.0 – 1.0) for memory to be included.
 * Below this threshold, memory is ignored and the system continues normally.
 */
const MEMORY_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Maximum number of memory entries to include in the context.
 */
const MAX_MEMORY_ENTRIES = 3;

/**
 * Maximum character length for a single memory entry's formatted text.
 */
const MAX_MEMORY_ENTRY_CHARS = 500;

/**
 * A scored memory entry returned by the retrieval service.
 */
export interface ScoredMemory {
  entry: GlobalMemoryEntry;
  score: number;
}

/**
 * The result of a memory retrieval operation.
 */
export interface MemoryRetrievalResult {
  /** Whether memory entries were found with sufficient confidence. */
  hasMemory: boolean;

  /** The scored memory entries (empty if confidence too low). */
  entries: ScoredMemory[];

  /** Formatted memory context string for injection (empty if no memory). */
  formattedContext: string;

  /** Average confidence score across all retrieved entries. */
  avgConfidence: number;
}

/**
 * Retrieves relevant global memory entries for the given query.
 *
 * @param query - The current user message text.
 * @returns A MemoryRetrievalResult with scored entries and formatted context.
 */
export function retrieveMemory(query: string): MemoryRetrievalResult {
  if (!query || query.trim().length === 0) {
    return {
      hasMemory: false,
      entries: [],
      formattedContext: "",
      avgConfidence: 0,
    };
  }

  // Search global memory for relevant entries
  const scoredEntries = memoryService.searchGlobalMemory(query);

  if (scoredEntries.length === 0) {
    logger.debug("[retrieveMemory] No global memory entries found");
    return {
      hasMemory: false,
      entries: [],
      formattedContext: "",
      avgConfidence: 0,
    };
  }

  // Filter by confidence threshold
  const confidentEntries = scoredEntries.filter(
    (entry) => entry.score >= MEMORY_CONFIDENCE_THRESHOLD,
  );

  if (confidentEntries.length === 0) {
    logger.debug(
      `[retrieveMemory] All ${scoredEntries.length} entries below confidence threshold (${MEMORY_CONFIDENCE_THRESHOLD})`,
    );
    return {
      hasMemory: false,
      entries: [],
      formattedContext: "",
      avgConfidence: 0,
    };
  }

  // Take top entries up to the limit
  const topEntries = confidentEntries.slice(0, MAX_MEMORY_ENTRIES);

  // Calculate average confidence
  const avgConfidence =
    topEntries.reduce((sum, e) => sum + e.score, 0) / topEntries.length;

  // Format memory context
  const formattedContext = formatMemoryContext(topEntries);

  logger.info(
    `[retrieveMemory] Retrieved ${topEntries.length} memory entries ` +
    `(avg confidence: ${avgConfidence.toFixed(3)})`,
  );

  return {
    hasMemory: true,
    entries: topEntries,
    formattedContext,
    avgConfidence,
  };
}

/**
 * Formats scored memory entries into a context string for LLM injection.
 *
 * The format is:
 * ```
 * [Memory Context — Previous Knowledge]
 * Q: <query>
 * A: <answer>
 * ---
 * Q: <query>
 * A: <answer>
 * ```
 *
 * @param entries - The scored memory entries to format.
 * @returns A formatted string for injection into the LLM context.
 */
function formatMemoryContext(entries: ScoredMemory[]): string {
  if (entries.length === 0) {
    return "";
  }

  const parts: string[] = ["[Memory Context — Previous Knowledge]"];

  for (const { entry } of entries) {
    const truncatedAnswer =
      entry.answer.length > MAX_MEMORY_ENTRY_CHARS
        ? entry.answer.substring(0, MAX_MEMORY_ENTRY_CHARS) + "..."
        : entry.answer;

    parts.push(`Q: ${entry.query}`);
    parts.push(`A: ${truncatedAnswer}`);
    parts.push("---");
  }

  return parts.join("\n");
}