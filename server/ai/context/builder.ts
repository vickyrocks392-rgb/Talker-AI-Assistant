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
 * Phase 6: The builder now accepts an optional ExecutionPlan from the
 * Orchestrator. When provided, only the context sources specified in
 * the plan are activated, eliminating unnecessary work.
 *
 * ConversationService should use this builder instead of manually
 * assembling messages.
 */

import { createChatSystemPrompt } from "../prompts";
import { memoryService } from "../../memory/service";
import { retrieveMemory } from "../../memory/retrieval";
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
import type { ExecutionPlan } from "../orchestrator/types";
import type { ChatAttachment } from "../../../shared/types";

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
   * When an executionPlan is provided, only the context sources specified
   * in the plan are activated. This eliminates unnecessary work like
   * generating embeddings, querying Chroma, or running the tool planner
   * for requests that don't need them.
   *
   * Assembly order:
   *   1. System Prompt
   *   2. Conversation Memory (history) — only if plan.useMemory
   *   3. Retrieved Knowledge (RAG) — only if plan.useRag
   *   4. Tool Context — only if plan.useTools
   *   5. Current User Message
   *
   * @param options - The builder options (text, conversationId, etc.).
   * @returns The assembled context with metadata.
   */
  async build(options: ContextBuilderOptions): Promise<ContextBuilderResult> {
    const { text, conversationId, history, persona, executionPlan } = options;

    // ── 1. System Prompt ──────────────────────────────────────────
    const systemPrompt = createChatSystemPrompt(persona);

    // ── 2. Conversation Memory (conditional) ──────────────────────
    const shouldUseMemory = executionPlan ? executionPlan.useMemory : true;
    const historyMessages = shouldUseMemory
      ? this.loadHistory(conversationId, history)
      : [];

    // ── 3. Global Memory Retrieval (user-scoped, site-wide) ───────
    // This retrieves Q&A pairs from previous conversations that are
    // relevant to the current query. Memory retrieval is completely
    // separate from document/RAG retrieval (requirement 4).
    // Memory augments responses rather than replacing reasoning (req 5).
    const memoryResult = retrieveMemory(text);

    // ── 4. RAG Context (conditional) ──────────────────────────────
    // RAG retrieval is NEVER performed in the non-attachment path.
    // Knowledge Center documents must never participate in chat retrieval
    // unless they are attached as active documents for the current conversation.
    // The buildWithAttachments() method is the only path that performs RAG,
    // and it scopes retrieval to the active document IDs only.
    const ragResult = null;

    // ── 5. Tool Context (conditional) ─────────────────────────────
    const shouldUseTools = executionPlan ? executionPlan.useTools : true;
    const toolResult = shouldUseTools
      ? await this.executeToolIfNeeded(text, executionPlan)
      : null;

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

    // Global memory context (Medium priority — augments responses)
    if (memoryResult.hasMemory) {
      sections.push({
        label: "global_memory_context",
        priority: ContextPriority.Medium,
        content: memoryResult.formattedContext,
        role: "system",
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

    // ── Voice input system message (temporary, request-scoped) ─────
    // Injected immediately before the user message ONLY when the current
    // request originated from voice input. This message is never persisted
    // to memory or conversation history and does not affect future messages.
    if (options.isVoice) {
      sections.push({
        label: "voice_input_hint",
        priority: ContextPriority.Critical,
        content:
          "IMPORTANT CONTEXT:\n\n" +
          "The following user message was submitted through Noryx's voice interface.\n\n" +
          "The user's speech has already been successfully transcribed into text and delivered to you.\n\n" +
          "If the user asks questions such as:\n" +
          "- Can you hear me?\n" +
          "- Is my microphone working?\n" +
          "- Did you receive my voice?\n\n" +
          "interpret them as questions about the success of the speech recognition pipeline rather than direct audio perception.\n\n" +
          "Confirm successful transcription when appropriate.\n\n" +
          "Do not claim direct audio perception or continuous listening.\n\n" +
          "Keep this instruction temporary and request-scoped only.",
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
      hasMemoryContext: memoryResult.hasMemory,
      memoryEntryCount: memoryResult.entries.length,
      memoryAvgConfidence: memoryResult.avgConfidence,
      hasToolResult: toolResult !== null,
      toolName: toolResult?.toolName ?? "",
      toolSuccess: toolResult?.result.success ?? false,
      historyMessageCount: historyMessages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    };

    logger.info(
      `Context built: ${messages.length} messages, ` +
      `${metadata.totalChars} chars, ` +
      `memory=${metadata.hasMemoryContext}, ` +
      `rag=${metadata.hasRagContext}, ` +
      `tool=${metadata.hasToolResult}, ` +
      `history=${metadata.historyMessageCount}` +
      (executionPlan ? `, plan=${executionPlan.mode}` : "") +
      (options.isVoice ? ", voice=true" : ""),
    );

    return { messages, metadata };
  }

  /**
   * Build context with attachment awareness.
   *
   * When attachments are present, this method:
   * 1. Injects attachment metadata into the system prompt
   * 2. Scopes RAG retrieval to only the attached documents
   * 3. Adds a prompt hint so pronouns (this, it, the document) resolve naturally
   *
   * @param options - Standard context builder options.
   * @param attachments - Array of attached documents (documentId + filename).
   * @returns The assembled context with metadata.
   */
   async buildWithAttachments(
     options: ContextBuilderOptions,
     attachments: ChatAttachment[],
   ): Promise<ContextBuilderResult> {
      const { text, conversationId, history, persona, executionPlan } = options;

      // ── 1. System Prompt ──────────────────────────────────────────
     const baseSystemPrompt = createChatSystemPrompt(persona);

     // Inject attachment metadata into the system prompt
     const attachmentNames = attachments.map((a) => a.filename).join(", ");
     const attachmentHint =
       `\n\nAttached Documents: ${attachmentNames}\n` +
       `This message refers to these attached documents unless explicitly stated otherwise. ` +
       `Pronouns such as "this", "it", "the document", "the file" refer to the attached documents.`;

     const systemPrompt = baseSystemPrompt + attachmentHint;

     // ── 2. Conversation Memory (conditional) ──────────────────────
     const shouldUseMemory = executionPlan ? executionPlan.useMemory : true;
     const historyMessages = shouldUseMemory
       ? this.loadHistory(conversationId, history)
       : [];

     // ── 3. Global Memory Retrieval (user-scoped, site-wide) ───────
     // This retrieves Q&A pairs from previous conversations that are
     // relevant to the current query. Memory retrieval is completely
     // separate from document/RAG retrieval (requirement 4).
     // Memory augments responses rather than replacing reasoning (req 5).
     const memoryResult = retrieveMemory(text);

     // ── 4. RAG Context (conditional, scoped to attachments) ───────
      const documentIds = attachments
        .filter((a) => a.documentId)
        .map((a) => a.documentId);

     // If attachments exist, always run attachment-scoped retrieval
    // regardless of what the orchestration planner decided.
    // This prevents the planner from skipping RAG when documents
    // are explicitly attached to the message.
    const shouldUseRag =
      documentIds.length > 0
        ? true
        : executionPlan
          ? executionPlan.useRag
          : true;

     logger.debug(
       `Received attachments: ${attachmentNames}`,
     );

     const ragResult = shouldUseRag
       ? await this.retrieveRagContextForAttachments(text, documentIds)
       : null;

     // ── 4. Tool Context (conditional) ─────────────────────────────
    const shouldUseTools = executionPlan ? executionPlan.useTools : true;
    const toolResult = shouldUseTools
      ? await this.executeToolIfNeeded(text, executionPlan)
      : null;

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

    // Global memory context (Medium priority — augments responses)
    if (memoryResult.hasMemory) {
      sections.push({
        label: "global_memory_context",
        priority: ContextPriority.Medium,
        content: memoryResult.formattedContext,
        role: "system",
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

    // ── Voice input system message (temporary, request-scoped) ─────
    // Injected immediately before the user message ONLY when the current
    // request originated from voice input. This message is never persisted
    // to memory or conversation history and does not affect future messages.
    if (options.isVoice) {
      sections.push({
        label: "voice_input_hint",
        priority: ContextPriority.Critical,
        content:
          "IMPORTANT CONTEXT:\n\n" +
          "The following user message was submitted through Noryx's voice interface.\n\n" +
          "The user's speech has already been successfully transcribed into text and delivered to you.\n\n" +
          "If the user asks questions such as:\n" +
          "- Can you hear me?\n" +
          "- Is my microphone working?\n" +
          "- Did you receive my voice?\n\n" +
          "interpret them as questions about the success of the speech recognition pipeline rather than direct audio perception.\n\n" +
          "Confirm successful transcription when appropriate.\n\n" +
          "Do not claim direct audio perception or continuous listening.\n\n" +
          "Keep this instruction temporary and request-scoped only.",
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
      hasMemoryContext: memoryResult.hasMemory,
      memoryEntryCount: memoryResult.entries.length,
      memoryAvgConfidence: memoryResult.avgConfidence,
      hasToolResult: toolResult !== null,
      toolName: toolResult?.toolName ?? "",
      toolSuccess: toolResult?.result.success ?? false,
      historyMessageCount: historyMessages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    };

    logger.info(
      `Context built with attachments: ${messages.length} messages, ` +
      `${metadata.totalChars} chars, ` +
      `memory=${metadata.hasMemoryContext}, ` +
      `rag=${metadata.hasRagContext} (${metadata.ragChunkCount} chunks), ` +
      `attachments=[${attachmentNames}]` +
      (executionPlan ? `, plan=${executionPlan.mode}` : "") +
      (options.isVoice ? ", voice=true" : ""),
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
   * Retrieve RAG context scoped to specific attached documents.
   */
  private async retrieveRagContextForAttachments(
    text: string,
    documentIds: string[],
  ): Promise<{ context: string; chunkCount: number; avgScore: number } | null> {
    try {
      const ragContext = await ragService.retrieveContextForDocuments(text, documentIds);

      if (!ragContext) {
        logger.debug("No RAG context retrieved from attached documents");
        return null;
      }

      logger.info(
        `Retrieved ${ragContext.chunkCount} chunks from attachment scope ` +
        `(avg score: ${ragContext.avgScore.toFixed(3)})`,
      );

      return ragContext;
    } catch (error) {
      logger.error("Attachment-scoped RAG retrieval failed", error);
      return null;
    }
  }

  /**
   * Run the deterministic planner. If a tool matches, execute it and
   * return the formatted result. Returns null if no tool matches.
   *
   * When an execution plan specifies a specific tool, that tool is used
   * directly without running the planner (saving a pattern-matching pass).
   */
  private async executeToolIfNeeded(
    text: string,
    executionPlan?: ExecutionPlan,
  ): Promise<{ toolName: string; result: import("../tools/types").ToolResult } | null> {
    // If the execution plan specifies a tool, use it directly
    if (executionPlan?.tool) {
      logger.info(`Using pre-resolved tool from plan: ${executionPlan.tool}`);

      const result = await executeTool({
        toolName: executionPlan.tool,
        args: {},
      });

      if (result.success) {
        logger.info(`Tool "${executionPlan.tool}" succeeded`);
      } else {
        logger.warn(
          `Tool "${executionPlan.tool}" failed: ` +
          `${(result as { success: false; error: string }).error}`,
        );
      }

      return { toolName: executionPlan.tool, result };
    }

    // Otherwise, run the planner to find a matching tool
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