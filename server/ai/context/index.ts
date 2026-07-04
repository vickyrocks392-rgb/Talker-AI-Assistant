/**
 * Context Builder subsystem — barrel export.
 *
 * The Context Builder is responsible for constructing the complete LLM
 * context (OllamaMessage[]) from all available sources:
 *
 *   1. System Prompt
 *   2. Conversation Memory (history)
 *   3. Retrieved Knowledge (RAG)
 *   4. Tool Context (tool execution results)
 *   5. Current User Message
 *
 * Usage:
 * ```ts
 * import { ContextBuilder } from "../context";
 *
 * const builder = new ContextBuilder();
 * const { messages, metadata } = await builder.build({
 *   text: "Hello!",
 *   conversationId: "abc123",
 *   persona: { personality: "friendly" },
 * });
 * ```
 */

export { ContextBuilder } from "./builder";
export { TokenBudgeter } from "./budget";
export { formatToolContext, formatRagContext } from "./formatter";
export { ContextPriority } from "./types";
export type {
  ContextBuilderOptions,
  ContextBuilderResult,
  ContextMetadata,
  ContextSection,
} from "./types";