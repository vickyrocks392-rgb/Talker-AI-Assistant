/**
 * ConversationService — orchestrator for chat conversations.
 *
 * Phase 5: Refactored to use the Context Builder subsystem.
 * Phase 6: Integrated with the Intelligent Orchestration Layer.
 * Phase 7: Attachment-aware RAG retrieval for attached documents.
 *
 * The Orchestrator now sits between the request and the Context Builder,
 * producing an ExecutionPlan that tells the Context Builder which context
 * sources to activate and which to skip.
 *
 * Flow:
 *   1. Receive request (with optional attachments)
 *   2. Call Orchestrator → ExecutionPlan
 *   3. Call Context Builder with ExecutionPlan and attachments
 *   4. Call Provider
 *   5. Persist Memory
 *   6. Return Response
 */

import { parseChatResponse, StreamReplyExtractor } from "../parser";
import { getAIProvider } from "../provider";
import { createLogger } from "../../utils/logger";
import { getUserFriendlyErrorMessage } from "../../utils/errors";
import { memoryService } from "../../memory/service";
import { ContextBuilder } from "../context";
import { orchestrate } from "../orchestrator";
import type { ChatResponse } from "../types";
import type { Persona, ConversationMessage } from "../types";
import type { ChatAttachment } from "../../../shared/types";

const logger = createLogger("ConversationService");

export interface ConversationServiceRequest {
  text: string;
  conversationId?: string;
  history?: ConversationMessage[];
  persona?: Persona;
  stream?: boolean;
  /** Optional attachments scoping RAG retrieval to specific documents. */
  attachments?: ChatAttachment[];
}

export interface ConversationServiceResult {
  replyText: string;
  mapAction: { type: "none" | "search" | "directions"; query?: string; directions?: unknown };
  searchSources?: string[];
}

// ── Singleton Context Builder ───────────────────────────────────────

/**
 * Shared Context Builder instance.
 * Configured with a default max context size.
 * The TokenBudgeter inside can be tuned via constructor args if needed.
 */
const contextBuilder = new ContextBuilder();

// ── Orchestrator ────────────────────────────────────────────────────

/**
 * Handle a non-streaming chat request.
 *
 * Orchestration flow:
 *   1. Call Orchestrator to produce an execution plan
 *   2. Call Context Builder with the execution plan
 *   3. Call AI provider
 *   4. Parse the response
 *   5. Persist to memory
 *   6. Return the response
 */
export async function handleNonStreaming(
  request: ConversationServiceRequest,
): Promise<ChatResponse> {
  const { text, conversationId, persona, attachments } = request;

  // Step 1: Orchestrate — determine which context sources to use
  const { plan } = await orchestrate(text);

  logger.debug("Execution plan", {
    mode: plan.mode,
    useMemory: plan.useMemory,
    useRag: plan.useRag,
    useTools: plan.useTools,
    tool: plan.tool,
    reason: plan.reason,
    hasAttachments: !!attachments?.length,
  });

  // Step 2: Build context using the Context Builder
  const options = {
    text,
    conversationId,
    history: request.history,
    persona,
    executionPlan: plan,
  };

  const hasAttachments = attachments && attachments.length > 0;

  // If attachments are present, use attachment-aware context building
  const { messages, metadata } = hasAttachments
    ? await contextBuilder.buildWithAttachments(options, attachments)
    : await contextBuilder.build(options);

  logger.debug("Context built", {
    messageCount: messages.length,
    totalChars: metadata.totalChars,
    hasRag: metadata.hasRagContext,
    hasTool: metadata.hasToolResult,
    historyCount: metadata.historyMessageCount,
    planMode: plan.mode,
    attachmentsCount: attachments?.length ?? 0,
  });

  // Step 3: Call AI provider
  const provider = getAIProvider();
  const response = await provider.chat({ messages });
  const parsed = parseChatResponse(response.message.content);

  // Step 4: Persist to memory
  if (conversationId) {
    memoryService.saveMessage(conversationId, "user", text);
    memoryService.saveMessage(conversationId, "assistant", parsed.replyText);
  }

  const chatResponse: ChatResponse = {
    replyText: parsed.replyText,
    mapAction: parsed.mapAction,
    searchSources: [],
  };

  logger.debug("Chat response generated", {
    replyLength: parsed.replyText.length,
    mapType: parsed.mapAction.type,
    hasConversationId: !!conversationId,
    planMode: plan.mode,
    hasAttachments: hasAttachments,
  });

  return chatResponse;
}

/**
 * Handle a streaming chat request.
 *
 * Orchestration flow:
 *   1. Call Orchestrator to produce an execution plan
 *   2. Call Context Builder with the execution plan (before streaming)
 *   3. Call AI provider with streaming
 *   4. Parse tokens as they arrive
 *   5. Persist to memory on completion
 *   6. Signal completion via callbacks
 */
export async function handleStreaming(
  request: ConversationServiceRequest,
  onToken: (token: string) => void,
  onDone: (result: ChatResponse) => void,
  onError: (error: string) => void,
): Promise<void> {
  const { text, conversationId, persona, attachments } = request;

  // Step 1: Orchestrate — determine which context sources to use
  const { plan } = await orchestrate(text);

  logger.debug("Execution plan for streaming", {
    mode: plan.mode,
    useMemory: plan.useMemory,
    useRag: plan.useRag,
    useTools: plan.useTools,
    tool: plan.tool,
    reason: plan.reason,
    hasAttachments: !!attachments?.length,
  });

  // Step 2: Build context using the Context Builder
  const options = {
    text,
    conversationId,
    history: request.history,
    persona,
    executionPlan: plan,
  };

  const hasAttachments = attachments && attachments.length > 0;

  let messages;
  let metadata;

  try {
    const result = hasAttachments
      ? await contextBuilder.buildWithAttachments(options, attachments)
      : await contextBuilder.build(options);
    messages = result.messages;
    metadata = result.metadata;
  } catch (error) {
    logger.error("Failed to build context for streaming", error);
    onError("Failed to build context");
    return;
  }

  logger.debug("Context built for streaming", {
    messageCount: messages.length,
    totalChars: metadata.totalChars,
    hasRag: metadata.hasRagContext,
    hasTool: metadata.hasToolResult,
    historyCount: metadata.historyMessageCount,
    planMode: plan.mode,
    attachmentsCount: attachments?.length ?? 0,
  });

  // Step 3: Call AI provider with streaming
  const provider = getAIProvider();

  let fullContent = "";
  const extractor = new StreamReplyExtractor();

  try {
    for await (const chunk of provider.chatStream({ messages })) {
      fullContent += chunk.message.content;

      const delta = extractor.append(chunk.message.content);
      if (delta) {
        onToken(delta);
      }

      if (chunk.done) {
        try {
          const parsed = parseChatResponse(fullContent);

          // Step 4: Persist to memory after successful stream completion
          if (conversationId) {
            memoryService.saveMessage(conversationId, "user", text);
            memoryService.saveMessage(conversationId, "assistant", parsed.replyText);
            
            logger.debug("Messages persisted to memory", {
              conversationId,
              userMessage: text,
              assistantMessage: parsed.replyText,
              replyLength: parsed.replyText.length,
              mapType: parsed.mapAction.type,
            });
          }

          const chatResponse: ChatResponse = {
            replyText: parsed.replyText,
            mapAction: parsed.mapAction,
            searchSources: [],
          };

          onDone(chatResponse);
        } catch {
          logger.warn("Failed to parse streamed response");
          onDone({
            replyText: fullContent,
            mapAction: { type: "none" },
            searchSources: [],
          });
        }
      }
    }
  } catch (streamError) {
    logger.error("Streaming error", streamError);
    onError(getUserFriendlyErrorMessage(streamError));
  }
}