/**
 * Chat endpoint — POST /api/chat
 *
 * Thin HTTP controller. Business logic is delegated to ConversationService.
 * Supports both non-streaming and streaming (Server-Sent Events) responses.
 */

import type express from "express";
import { validateChatRequest } from "../utils/validation";
import { createLogger } from "../utils/logger";
import { getUserFriendlyErrorMessage, OllamaError, ParseError } from "../utils/errors";
import {
  handleNonStreaming,
  handleStreaming,
} from "../ai/conversation/conversationService";
import type { ChatResponse } from "../ai/types";

const logger = createLogger("ChatRoute");

export async function handleChat(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  try {
    const { text, conversationId, history, persona, stream, attachments } = validateChatRequest(req.body as Record<string, unknown>);

    logger.debug("Chat request received", {
      textLength: text.length,
      historyLength: history?.length ?? 0,
      streaming: stream ?? false,
      hasConversationId: !!conversationId,
      attachmentsCount: attachments?.length ?? 0,
    });

    // ── Streaming path (SSE) ──────────────────────────────────────
    if (stream === true) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await handleStreaming(
        { text, conversationId, history, persona, stream, attachments },
        // onToken
        (token: string) => {
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        // onDone
        (result: ChatResponse) => {
          res.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`);
          res.end();
        },
        // onError
        (error: string) => {
          res.write(`data: ${JSON.stringify({ error })}\n\n`);
          res.end();
        },
      );

      return;
    }

    // ── Non-streaming path ────────────────────────────────────────
    const chatResponse = await handleNonStreaming({
      text,
      conversationId,
      history,
      persona,
      attachments,
    });

    logger.debug("Chat response generated", {
      replyLength: chatResponse.replyText.length,
      mapType: chatResponse.mapAction.type,
    });

    res.json(chatResponse);
  } catch (error: unknown) {
    // Model-level failures (Ollama down, parse errors) → graceful 200 fallback
    if (error instanceof OllamaError || error instanceof ParseError) {
      logger.error("Chat model error", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      res.status(200).json({
        replyText: errorMessage,
        mapAction: { type: "none" },
        searchSources: [],
      } satisfies ChatResponse);
      return;
    }

    // Infrastructure errors (validation, config, DB, unexpected) → global error handler
    next(error);
  }
}