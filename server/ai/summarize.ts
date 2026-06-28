/**
 * Conversation summarization module.
 * Generates short titles for chat sessions.
 */

import { ConversationMessage } from "./types";
import { createSummarizeSystemPrompt } from "./prompts";
import { getOllamaProvider } from "./ollama";
import { parseSummaryResponse } from "./parser";
import { createLogger } from "../utils/logger";
import { getUserFriendlyErrorMessage } from "../utils/errors";

const logger = createLogger("Summarizer");

/**
 * Create a summary title for a conversation.
 * Converts message history into a concise one-sentence summary.
 */
export async function summarizeConversation(
  messages: ConversationMessage[]
): Promise<string> {
  if (!messages || messages.length === 0) {
    return "Personal Companion Chat";
  }

  try {
    // Convert to Ollama message format
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");

    const prompt = `Create a very short, single one-sentence summary (under 5 words) of this conversation to serve as a chat session title. Respond ONLY with JSON.

Conversation transcript:
${conversationText}`;

    const provider = getOllamaProvider();
    const response = await provider.summarize([
      { role: "system", content: createSummarizeSystemPrompt() },
      { role: "user", content: prompt },
    ]);

    const parsed = parseSummaryResponse(response);
    logger.debug(`Summarized conversation: "${parsed}"`);
    return parsed;
  } catch (error) {
    logger.error("Summarization failed", error);
    // Return default, don't throw
    return "Personal Companion Chat";
  }
}
