/**
 * ConversationService — business logic for chat conversations.
 *
 * Orchestrates history loading, AI generation, and persistence.
 * The Chat Route becomes a thin HTTP controller that delegates here.
 */

import { createChatSystemPrompt } from "../prompts";
import { parseChatResponse, StreamReplyExtractor } from "../parser";
import { getAIProvider } from "../provider";
import { createLogger } from "../../utils/logger";
import { getUserFriendlyErrorMessage } from "../../utils/errors";
import { memoryService } from "../../memory/service";
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

/**
 * Build the OllamaMessage array for the AI provider.
 *
 * If conversationId is provided, load history from MemoryService
 * and ignore the supplied history array. Otherwise use the legacy
 * history array for backward compatibility.
 */
function buildMessages(
  text: string,
  conversationId: string | undefined,
  history: ConversationMessage[] | undefined,
  persona: Persona | undefined,
): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    { role: "system", content: createChatSystemPrompt(persona) },
  ];

  if (conversationId) {
    // Load persisted history from MemoryService
    const persistedMessages = memoryService.getMessages(conversationId);
    for (const msg of persistedMessages.slice(-12)) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }
  } else if (history && Array.isArray(history)) {
    // Legacy path: use supplied history array
    for (const msg of history.slice(-12)) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text,
      });
    }
  }

  // Current user message
  messages.push({ role: "user", content: text });

  return messages;
}

/**
 * Handle a non-streaming chat request.
 */
export async function handleNonStreaming(
  request: ConversationServiceRequest,
): Promise<ChatResponse> {
  const { text, conversationId, history, persona } = request;

  const messages = buildMessages(text, conversationId, history, persona);
  const provider = getAIProvider();

  const response = await provider.chat({ messages });
  const parsed = parseChatResponse(response.message.content);

  // Persist if conversationId is provided
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
 * Returns an object with the stream (AsyncGenerator) and a promise that
 * resolves with the final parsed response after the stream completes.
 */
export async function handleStreaming(
  request: ConversationServiceRequest,
  onToken: (token: string) => void,
  onDone: (result: ChatResponse) => void,
  onError: (error: string) => void,
): Promise<void> {
  const { text, conversationId, history, persona } = request;

  const messages = buildMessages(text, conversationId, history, persona);
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

          // Persist assistant reply after successful stream completion
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