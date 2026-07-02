/**
 * ConversationService — business logic for chat conversations.
 *
 * Orchestrates history loading, tool planning/execution, AI generation,
 * and persistence.
 *
 * Phase 3B: The Tool Engine is integrated into the pipeline.
 *  1. Receive the user message.
 *  2. Call the deterministic planner.
 *  3. If a tool matches → execute it → inject the structured result
 *     into the prompt sent to the LLM.
 *  4. The LLM generates the final natural-language response.
 *  5. If no tool matches → continue exactly as before.
 */

import { createChatSystemPrompt } from "../prompts";
import { parseChatResponse, StreamReplyExtractor } from "../parser";
import { getAIProvider } from "../provider";
import { createLogger } from "../../utils/logger";
import { getUserFriendlyErrorMessage } from "../../utils/errors";
import { memoryService } from "../../memory/service";
import { plan } from "../tools/planner";
import { executeTool } from "../tools/executor";
import { ragService } from "../rag/service";
import type { OllamaMessage, ChatResponse } from "../types";
import type { Persona, ConversationMessage } from "../types";
import type { ToolResult, CalculatorResult, DateTimeResult } from "../tools/types";

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

// ── Tool context formatters ──────────────────────────────────────────

/**
 * Format a successful calculator result into readable text.
 */
function formatCalculatorOutput(data: CalculatorResult): string {
  return [
    `Expression:`,
    `${data.expression}`,
    ``,
    `Answer:`,
    `${data.result}`,
  ].join("\n");
}

/**
 * Format a successful date-time result into readable text.
 */
function formatDateTimeOutput(data: DateTimeResult): string {
  return [
    `Current Date:`,
    `${data.date}`,
    ``,
    `Current Time:`,
    `${data.time}`,
    ``,
    `Timezone:`,
    `${data.timezone}`,
    ``,
    `ISO Timestamp:`,
    `${data.iso}`,
  ].join("\n");
}

/**
 * Build a strongly-worded, tool-specific system prompt that tells the LLM
 * the tool output is authoritative and must be used to answer the user.
 *
 * The output is formatted as readable text, not raw JSON, so the LLM
 * can consume it naturally.
 *
 * To add a new tool, add a new `case` to the switch statement and a
 * corresponding `format*Output` function above.
 */
function buildToolContext(
  toolName: string,
  result: ToolResult,
): string {
  // ── Authoritative preamble ──────────────────────────────────────
  const preamble =
    `A system tool has already been executed. ` +
    `The tool output below is authoritative. ` +
    `Do NOT say you cannot access this information. ` +
    `Do NOT ignore this tool result. ` +
    `Do NOT recalculate or invent values. ` +
    `Use this tool result to answer the user's question naturally.`;

  // ── Tool-specific body ──────────────────────────────────────────
  let body: string;

  if (!result.success) {
    // Tool failed — report the error clearly
    body = `Error: ${(result as { success: false; error: string }).error}`;
  } else {
    switch (toolName) {
      case "calculator":
        body = formatCalculatorOutput(
          (result as { success: true; data: CalculatorResult }).data,
        );
        break;

      case "datetime":
        body = formatDateTimeOutput(
          (result as { success: true; data: DateTimeResult }).data,
        );
        break;

      default:
        // Fallback for future tools: show the raw data
        body = JSON.stringify(
          (result as { success: true; data: unknown }).data,
          null,
          2,
        );
        break;
    }
  }

  return [
    preamble,
    ``,
    `Tool:`,
    `${toolName}`,
    ``,
    `Tool Output:`,
    body,
  ].join("\n");
}

/**
 * Retrieve relevant context from the RAG pipeline and inject it as a system
 * message before the user message. This happens BEFORE tool injection so
 * that the LLM has access to retrieved knowledge when planning tool usage.
 *
 * If no relevant chunks are found or RAG is unavailable, the messages
 * array is returned unchanged.
 *
 * @returns The (possibly augmented) messages array.
 */
async function injectRagContext(
  text: string,
  messages: OllamaMessage[],
): Promise<OllamaMessage[]> {
  try {
    const ragContext = await ragService.retrieveContext(text);

    if (!ragContext) {
      logger.debug("No RAG context retrieved");
      return messages;
    }

    logger.info(
      `Injecting RAG context: ${ragContext.chunkCount} chunks (avg score: ${ragContext.avgScore.toFixed(3)})`
    );

    // Inject the RAG context as a system message right before the user message.
    // The LLM will use this context to answer the user's question.
    // Insert it before the last message (which is the current user message).
    messages.splice(messages.length - 1, 0, {
      role: "system",
      content: ragContext.context,
    });

    return messages;
  } catch (error) {
    logger.error("RAG context injection failed", error);
    return messages;
  }
}

/**
 * Run the deterministic planner. If a tool matches, execute it and
 * inject a strongly-worded tool context message so the LLM treats
 * the tool output as authoritative.
 *
 * @returns The (possibly augmented) messages array.
 */
async function injectToolResult(
  text: string,
  messages: OllamaMessage[],
): Promise<OllamaMessage[]> {
  const toolRequest = plan(text);

  // No tool matches — fall through to normal chat pipeline
  if (!toolRequest) {
    return messages;
  }

  logger.info(`Tool matched: ${toolRequest.toolName}`);

  // Execute the tool
  const result = await executeTool(toolRequest);

  // Build a strongly-worded, readable tool context
  const toolContext = buildToolContext(toolRequest.toolName, result);

  if (result.success) {
    logger.info(`Tool "${toolRequest.toolName}" succeeded`);
  } else {
    logger.warn(`Tool "${toolRequest.toolName}" failed: ${(result as { success: false; error: string }).error}`);
  }

  // Inject the tool context as a system message right before the user message.
  // The LLM will use this authoritative context to generate a natural-language response.
  // Insert it before the last message (which is the current user message).
  messages.splice(messages.length - 1, 0, {
    role: "system",
    content: toolContext,
  });

  return messages;
}

/**
 * Handle a non-streaming chat request.
 */
export async function handleNonStreaming(
  request: ConversationServiceRequest,
): Promise<ChatResponse> {
  const { text, conversationId, history, persona } = request;

  let messages = buildMessages(text, conversationId, history, persona);

  // Phase 4.5: Inject RAG context if available (before tool injection)
  messages = await injectRagContext(text, messages);

  // Phase 3B: Run the tool planner and inject tool results if applicable
  messages = await injectToolResult(text, messages);

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

  let messages = buildMessages(text, conversationId, history, persona);

  // Phase 4.5: Inject RAG context if available (before tool injection)
  // This happens BEFORE streaming starts, so streaming continues to work
  // without any frontend changes.
  messages = await injectRagContext(text, messages);

  // Phase 3B: Run the tool planner and inject tool results if applicable
  // This happens BEFORE streaming starts, so streaming continues to work
  // without any frontend changes.
  messages = await injectToolResult(text, messages);

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