/**
 * Summarize endpoint — POST /api/summarize
 * Generates a short title for a conversation.
 */

import type express from "express";
import { validateSummaryRequest } from "../utils/validation";
import { summarizeConversation } from "../ai/summarize";
import { SummaryResponse } from "../ai/types";
import { createLogger } from "../utils/logger";

const logger = createLogger("SummarizeRoute");

export async function handleSummarize(
  req: express.Request,
  res: express.Response,
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
    logger.error("Summarize error", error);

    // Always return a default summary on error
    res.json({ summary: "Personal Companion Chat" } satisfies SummaryResponse);
  }
}
