/**
 * Summarize endpoint — POST /api/summarize
 * Generates a short title for a conversation.
 */

import type express from "express";
import { validateSummaryRequest } from "../utils/validation";
import { summarizeConversation } from "../ai/summarize";
import { SummaryResponse } from "../ai/types";
import { createLogger } from "../utils/logger";
import { OllamaError, ParseError } from "../utils/errors";

const logger = createLogger("SummarizeRoute");

export async function handleSummarize(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  try {
    const { messages } = validateSummaryRequest(req.body as Record<string, unknown>);

    logger.debug("Summarize request received", {
      messageCount: messages.length,
    });

    const summary = await summarizeConversation(messages);

    const response: SummaryResponse = { summary };
    logger.debug("Summary generated", { summary });

    res.json(response);
  } catch (error: unknown) {
    // Model-level failures (Ollama down, parse errors) → graceful fallback
    if (error instanceof OllamaError || error instanceof ParseError) {
      logger.error("Summarize model error", error);
      res.json({ summary: "Personal Companion Chat" } satisfies SummaryResponse);
      return;
    }

    // Infrastructure errors (validation, config, DB, unexpected) → global error handler
    next(error);
  }
}
