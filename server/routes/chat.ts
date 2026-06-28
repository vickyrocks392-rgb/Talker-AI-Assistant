/**
 * Chat endpoint — POST /api/chat
 *
 * Supports both non-streaming and streaming (Server-Sent Events) responses.
 */

import type express from "express";
import { createChatSystemPrompt } from "../ai/prompts";
import { parseChatResponse, StreamReplyExtractor } from "../ai/parser";
import { getOllamaProvider } from "../ai/ollama";
import { validateChatRequest } from "../utils/validation";
import { OllamaMessage, ChatResponse } from "../ai/types";
import { createLogger } from "../utils/logger";
import { getUserFriendlyErrorMessage } from "../utils/errors";

const logger = createLogger("ChatRoute");

export async function handleChat(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  try {
    const { text, history, persona, stream } = validateChatRequest(req.body as Record<string, unknown>);

    logger.debug("Chat request received", {
      textLength: text.length,
      historyLength: history?.length ?? 0,
      streaming: stream ?? false,
    });

    // Build messages array
    const messages: OllamaMessage[] = [
      { role: "system", content: createChatSystemPrompt(persona) },
    ];

    // Attach conversation history (last 12 messages to stay within context window)
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-12)) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.text,
        });
      }
    }

    // Current user message
    messages.push({ role: "user", content: text });

    const provider = getOllamaProvider();

    // ── Streaming path (SSE) ──────────────────────────────────────
    if (stream === true) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        let fullContent = "";
        const extractor = new StreamReplyExtractor();

        for await (const chunk of provider.chatStream({ messages })) {
          fullContent += chunk.message.content;
          
          const delta = extractor.append(chunk.message.content);
          if (delta) {
            res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
          }

          if (chunk.done) {
            try {
              const parsed = parseChatResponse(fullContent);
              res.write(`data: ${JSON.stringify({ done: true, ...parsed })}\n\n`);
            } catch {
              logger.warn("Failed to parse streamed response");
              res.write(`data: ${JSON.stringify({ done: true, error: "Parse failed" })}\n\n`);
            }
          }
        }
        res.end();
      } catch (streamError) {
        logger.error("Streaming error", streamError);
        res.write(`data: ${JSON.stringify({ error: getUserFriendlyErrorMessage(streamError) })}\n\n`);
        res.end();
      }
      return;
    }

    // ── Non-streaming path ────────────────────────────────────────
    const response = await provider.chat({ messages });
    const parsed = parseChatResponse(response.message.content);

    const chatResponse: ChatResponse = {
      replyText: parsed.replyText,
      mapAction: parsed.mapAction,
      searchSources: [],
    };

    logger.debug("Chat response generated", {
      replyLength: parsed.replyText.length,
      mapType: parsed.mapAction.type,
    });

    res.json(chatResponse);
  } catch (error: unknown) {
    logger.error("Chat error", error);

    const errorMessage = getUserFriendlyErrorMessage(error);
    const fallbackResponse: ChatResponse = {
      replyText: errorMessage,
      mapAction: { type: "none" },
      searchSources: [],
    };

    // Graceful degradation: return 200 with a friendly fallback so the
    // client never sees a hard 5xx for model-level failures.
    res.status(200).json(fallbackResponse);
  }
}
