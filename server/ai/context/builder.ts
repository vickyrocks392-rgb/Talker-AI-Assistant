/**
 * Context Builder — the core of the Context Builder subsystem.
 *
 * Responsible for assembling the complete LLM context (OllamaMessage[])
 * from all available sources in a deterministic order:
 *
 *   1. System Prompt
 *   2. Conversation Memory (history)
 *   3. Retrieved Knowledge (RAG)
 *   4. Tool Context (tool execution results)
 *   5. Current User Message
 *
 * The builder delegates to:
 *   - MemoryService for conversation history
 *   - RagService for RAG retrieval
 *   - Tool Engine (planner + executor) for tool results
 *   - TokenBudgeter for prompt size management
 *   - Formatters for structured data → text conversion
 *
 * ConversationService should use this builder instead of manually
 * assembling messages.
 */

import { createChatSystemPrompt } from "../prompts";
import { memoryService } from "../../memory/service";
import { plan } from "../tools/planner";
import { executeTool } from "../tools/executor";
import { ragService } from "../rag/service";
import { formatToolContext, formatRagContext } from "./formatter";
import { TokenBudgeter } from "./budget";
import { ContextPriority } from "./types";
import { createLogger } from "../../utils/logger";
import type { OllamaMessage } from "../types";
import type { Persona, ConversationMessage } from "../types";
import type { ContextBuilderOptions, ContextBuilderResult, ContextMetadata, ContextSection } from "./types";

const logger = createLogger("ContextBuilder");

// ── Defaults ────────────────────────────────────────────────────────

/**
 * Maximum number of history messages to include.
 * This is a safety limit before token budgeting is applied.
 */
const MAX_HISTORY_MESSAGES = 20;

/**
 * Default maximum context characters if not specified.
 */
const DEFAULT_MAX_CONTEXT_CHARS = 12000;

// ── Context Builder ─────────────────────────────────────────────────

export class ContextBuilder {
  private readonly budgeter: TokenBudgeter;

  constructor(maxContextChars?: number) {
    this.budgeter = new TokenBudgeter({
      maxContextChars: maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS,
    });
  }

  /**
   * Build the complete LLM context from all available sources.
   *
   * Assembly order:
   *   1. System Prompt
   *   2. Conversation Memory (history)
   *   3. Retrieved Knowledge (RAG) — only if available
   *   4. Tool Context — only if a tool matches
   *   5. Current User Message
   *
   * @param options - The builder options (text, conversationId, etc.).
   * @returns The assembled context with metadata.
   */
  async build(options: ContextBuilderOptions): Promise<ContextBuilderResult> {
    const { text, conversationId, history, persona } = options;

    // ── 1. System Prompt ──────────────────────────────────────────
    const systemPrompt = createChatSystemPrompt(persona);

    // ── 2. Conversation Memory ────────────────────────────────────
    const historyMessages = this.loadHistory(conversationId, history);

    // ── 3. RAG Context ────────────────────────────────────────────
    const ragResult = await this.retrieveRagContext(text);

    // ── 4. Tool Context ───────────────────────────────────────────
    const toolResult = await this.executeToolIfNeeded(text);

    // ── Build sections for budgeting ──────────────────────────────
    const sections: ContextSection[] = [];

    // System prompt (Critical priority)
    sections.push({
      label: "system_prompt",
      priority: ContextPriority.Critical,
      content: systemPrompt,
      role: "system",
    });

    // Conversation history (Low priority — can be truncated)
    for (const msg of historyMessages) {
      sections.push({
        label: `history_${msg.role}`,
        priority: ContextPriority.Low,
        content: msg.content,
        role: msg.role === "user" ? "user" : "assistant",
      });
    }

    // RAG context (Medium priority)
    if (ragResult) {
      sections.push({
        label: "rag_context",
        priority: ContextPriority.Medium,
        content: formatRagContext(ragResult),
        role: "system",
      });
    }

    // Tool context (High priority)
    if (toolResult) {
      sections.push({
        label: `tool_${toolResult.toolName}`,
        priority: ContextPriority.High,
        content: formatToolContext(toolResult.toolName, toolResult.result),
        role: "system",
      });
    }

    // Current user message (Critical priority)
    sections.push({
      label: "current_user_message",
      priority: ContextPriority.Critical,
      content: text,
      role: "user",
    });

    // ── Apply token budget ────────────────────────────────────────
    const budgetedSections = this.budgeter.applyBudget(sections);

    // ── Convert sections to OllamaMessage[] ───────────────────────
    const messages: OllamaMessage[] = budgetedSections.map((s) => ({
      role: s.role,
      content: s.content,
    }));

    // ── Build metadata ────────────────────────────────────────────
    const metadata: ContextMetadata = {
      hasRagContext: ragResult !== null,
      ragChunkCount: ragResult?.chunkCount ?? 0,
      ragAvgScore: ragResult?.avgScore ?? 0,
      hasToolResult: toolResult !== null,
      toolName: toolResult?.toolName ?? "",
      toolSuccess: toolResult?.result.success ?? false,
      historyMessageCount: historyMessages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    };

    logger.info(
      `Context built: ${messages.length} messages, ` +
      `${metadata.totalChars} chars, ` +
      `rag=${metadata.hasRagContext}, ` +
      `tool=${metadata.hasToolResult}, ` +
      `history=${metadata.historyMessageCount}`,
    );

    return { messages, metadata };
  }

  /**
   * Load conversation history from MemoryService or legacy history array.
   */
  private loadHistory(
    conversationId: string | undefined,
    history: ConversationMessage[] | undefined,
  ): { role: string; content: string }[] {
    const result: { role: string; content: string }[] = [];

    if (conversationId) {
      // Load persisted history from MemoryService
      const persistedMessages = memoryService.getMessages(conversationId);
      for (const msg of persistedMessages.slice(-MAX_HISTORY_MESSAGES)) {
        result.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    } else if (history && Array.isArray(history)) {
      // Legacy path: use supplied history array
      for (const msg of history.slice(-MAX_HISTORY_MESSAGES)) {
        result.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.text,
        });
      }
    }

    return result;
  }

  /**
   * Retrieve RAG context if available.
   * Returns null if RAG is unavailable or no relevant chunks found.
   */
  private async retrieveRagContext(
    text: string,
  ): Promise<{ context: string; chunkCount: number; avgScore: number } | null> {
    try {
      const ragContext = await ragService.retrieveContext(text);

      if (!ragContext) {
        logger.debug("No RAG context retrieved");
        return null;
      }

      logger.info(
        `Retrieved RAG context: ${ragContext.chunkCount} chunks ` +
        `(avg score: ${ragContext.avgScore.toFixed(3)})`,
      );

      return ragContext;
    } catch (error) {
      logger.error("RAG context retrieval failed", error);
      return null;
    }
  }

  /**
   * Run the deterministic planner. If a tool matches, execute it and
   * return the formatted result. Returns null if no tool matches.
   */
  private async executeToolIfNeeded(
    text: string,
  ): Promise<{ toolName: string; result: import("../tools/types").ToolResult } | null> {
    const toolRequest = plan(text);

    if (!toolRequest) {
      return null;
    }

    logger.info(`Tool matched: ${toolRequest.toolName}`);

    const result = await executeTool(toolRequest);

    if (result.success) {
      logger.info(`Tool "${toolRequest.toolName}" succeeded`);
    } else {
      logger.warn(
        `Tool "${toolRequest.toolName}" failed: ` +
        `${(result as { success: false; error: string }).error}`,
      );
    }

    return { toolName: toolRequest.toolName, result };
  }

  /**
   * Get the underlying TokenBudgeter instance.
   */
  getBudgeter(): TokenBudgeter {
    return this.budgeter;
  }
}