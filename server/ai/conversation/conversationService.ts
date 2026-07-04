/**
 * ConversationService — orchestrator for chat conversations.
 *
 * Phase 5: Refactored to use the Context Builder subsystem.
 * ConversationService no longer manually assembles prompts.
 * Its responsibilities are:
 *
 *   1. Receive request
 *   2. Call Context Builder
 *   3. Call Provider
 *   4. Persist Memory
 *   5. Return Response
 *
 * The Context Builder handles:
 *   - System prompt generation
 *   - Conversation history loading
 *   - RAG context retrieval
 *   - Tool planning and execution
 *   - Token budgeting
 *   - Message formatting
 */

import { parseChatResponse, StreamReplyExtractor } from "../parser";
import { getAIProvider } from "../provider";
import { createLogger } from "../../utils/logger";
import { getUserFriendlyErrorMessage } from "../../utils/errors";
import { memoryService } from "../../memory/service";
import { ContextBuilder } from "../context";
import type { OllamaMessage, ChatResponse } from "../types";
import type { Persona, ConversationMessage } from "../types";

const logger = createLogger("ConversationService");

export interface ConversationServiceRequest {
  text: string;
  conversationId?: string;
  history?: ConversationMessage[];
  persona?: Persona;
  stream?: boolean;
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
 *   1. Call Context Builder to assemble messages
 *   2. Call AI provider
 *   3. Parse the response
 *   4. Persist to memory
 *   5. Return the response
 */
export async function handleNonStreaming(
  request: ConversationServiceRequest,
): Promise<ChatResponse> {
  const { text, conversationId, persona } = request;

  // Step 1: Build context using the Context Builder
  const { messages, metadata } = await contextBuilder.build({
    text,
    conversationId,
    history: request.history,
    persona,
  });

  logger.debug("Context built", {
    messageCount: messages.length,
    totalChars: metadata.totalChars,
    hasRag: metadata.hasRagContext,
    hasTool: metadata.hasToolResult,
    historyCount: metadata.historyMessageCount,
  });

  // Step 2: Call AI provider
  const provider = getAIProvider();
  const response = await provider.chat({ messages });
  const parsed = parseChatResponse(response.message.content);

  // Step 3: Persist to memory
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
  });

  return chatResponse;
}

/**
 * Handle a streaming chat request.
 *
 * Orchestration flow:
 *   1. Call Context Builder to assemble messages (before streaming)
 *   2. Call AI provider with streaming
 *   3. Parse tokens as they arrive
 *   4. Persist to memory on completion
 *   5. Signal completion via callbacks
 */
export async function handleStreaming(
  request: ConversationServiceRequest,
  onToken: (token: string) => void,
  onDone: (result: ChatResponse) => void,
  onError: (error: string) => void,
): Promise<void> {
  const { text, conversationId, persona } = request;

  // Step 1: Build context using the Context Builder
  // This happens BEFORE streaming starts, so streaming continues to work
  // without any frontend changes.
  const { messages, metadata } = await contextBuilder.build({
    text,
    conversationId,
    history: request.history,
    persona,
  });

  logger.debug("Context built for streaming", {
    messageCount: messages.length,
    totalChars: metadata.totalChars,
    hasRag: metadata.hasRagContext,
    hasTool: metadata.hasToolResult,
    historyCount: metadata.historyMessageCount,
  });

  // Step 2: Call AI provider with streaming
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

          // Step 3: Persist to memory after successful stream completion
          if (conversationId) {
            memoryService.saveMessage(conversationId, "user", text);
            memoryService.saveMessage(conversationId, "assistant", parsed.replyText);
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