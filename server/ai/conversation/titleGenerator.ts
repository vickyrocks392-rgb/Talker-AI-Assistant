/**
 * Title Generator — generates intelligent conversation titles.
 *
 * Strategy:
 *   1. Preferred: Use AI to generate a short title (2-5 words) after the
 *      first assistant response completes, using the first user message
 *      and the assistant response.
 *   2. Fallback: Use the first user message, cleaned and capitalized.
 *
 * Titles are only generated if the current title is "New Conversation".
 * Manually renamed titles are never overwritten.
 */

import { getAIProvider } from "../provider";
import { createLogger } from "../../utils/logger";
import type { ConversationMessage } from "../types";

const logger = createLogger("TitleGenerator");

/**
 * Maximum length for fallback titles derived from user messages.
 */
const FALLBACK_MAX_LENGTH = 40;

/**
 * Minimum word count for a valid AI-generated title.
 */
const MIN_TITLE_WORDS = 2;

/**
 * Maximum word count for a valid AI-generated title.
 */
const MAX_TITLE_WORDS = 5;

/**
 * Maximum character length for a valid title.
 */
const MAX_TITLE_LENGTH = 50;

/**
 * Generate a title for a conversation using AI.
 *
 * @param messages - The conversation messages (user + assistant).
 * @returns A generated title string.
 */
export async function generateTitle(
  messages: ConversationMessage[],
): Promise<string> {
  if (!messages || messages.length === 0) {
    return "New Conversation";
  }

  // Try AI generation first
  try {
    const aiTitle = await generateTitleWithAI(messages);
    
    // Validate the AI-generated title
    const validation = validateTitle(aiTitle);
    
    if (validation.valid) {
      logger.info(`[TitleGenerator] Generated conversation title: "${aiTitle}"`);
      return aiTitle;
    }
    
    logger.warn(`[TitleGenerator] Rejected provider output: "${aiTitle}" - ${validation.reason}`);
  } catch (error) {
    logger.warn("[TitleGenerator] Title generation failed, using fallback", error);
  }

  // Fallback: use the first user message
  const fallbackTitle = generateFallbackTitle(messages);
  logger.info(`[TitleGenerator] Using fallback title: "${fallbackTitle}"`);
  return fallbackTitle;
}

/**
 * Validate an AI-generated title.
 * Returns whether the title is valid and a reason if invalid.
 */
function validateTitle(title: string | null | undefined): { valid: boolean; reason?: string } {
  if (!title || typeof title !== "string") {
    return { valid: false, reason: "title is null, undefined, or not a string" };
  }

  const trimmed = title.trim();
  
  // Check for empty string
  if (trimmed.length === 0) {
    return { valid: false, reason: "title is empty" };
  }

  // Check for JSON syntax (braces, brackets, colons, quotes)
  if (/[{}[\]":]/.test(trimmed)) {
    return { valid: false, reason: "title contains JSON syntax (braces, brackets, colons, or quotes)" };
  }

  // Check for "title:" prefix or similar JSON artifacts
  if (/^(title|json|response)\s*[:]/i.test(trimmed)) {
    return { valid: false, reason: "title contains JSON key prefix" };
  }

  // Check character length
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return { valid: false, reason: `title exceeds ${MAX_TITLE_LENGTH} characters (${trimmed.length})` };
  }

  // Check word count
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length < MIN_TITLE_WORDS) {
    return { valid: false, reason: `title has ${words.length} words (minimum ${MIN_TITLE_WORDS})` };
  }
  if (words.length > MAX_TITLE_WORDS) {
    return { valid: false, reason: `title has ${words.length} words (maximum ${MAX_TITLE_WORDS})` };
  }

  return { valid: true };
}

/**
 * Generate a title using the AI provider.
 * Uses the first user message and assistant response for context.
 */
async function generateTitleWithAI(
  messages: ConversationMessage[],
): Promise<string | null> {
  const firstUserMsg = messages.find((m) => m.role === "user");
  const firstAssistantMsg = messages.find((m) => m.role === "assistant");

  if (!firstUserMsg) {
    return null;
  }

  // Build context for title generation
  const userText = firstUserMsg.text;
  const assistantText = firstAssistantMsg?.text ?? "";

  // IMPORTANT: Groq requires the word "json" in the prompt when using response_format: json_object
  const prompt = `Generate a very short, descriptive title (2-5 words) for this conversation. The title should be professional, concise, and capture the main topic.

User message: "${userText}"
${assistantText ? `Assistant response: "${assistantText.substring(0, 500)}"` : ""}

Return a JSON object with the title. Example: {"title": "Resume Summary"}

Respond in JSON format with only the title field.`;

  const provider = getAIProvider();
  const response = await provider.summarize([
    {
      role: "system",
      content: "You are a helpful assistant that generates concise, descriptive conversation titles. Return a JSON object with the title field. Respond in JSON format.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  // Try to extract title from JSON response
  let title: string | null = null;
  
  try {
    // Try to parse as JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      title = parsed.title || parsed.Title || parsed.TITLE;
    } else {
      // No JSON found, use raw response
      title = response.trim();
    }
  } catch (parseError) {
    // JSON parsing failed, use raw response
    title = response.trim();
  }

  // Clean up the title
  if (title) {
    // Remove quotes if present
    title = title.replace(/^["']|["']$/g, "");
    // Remove trailing punctuation
    title = title.replace(/[.!?:]+$/, "");
    // Remove any remaining JSON artifacts
    title = title.replace(/[{}[\]":]/g, "").trim();
  }

  return title || null;
}

/**
 * Generate a fallback title from the first user message.
 * Cleans up the message and capitalizes first letter.
 */
function generateFallbackTitle(messages: ConversationMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");

  if (!firstUserMsg) {
    return "New Conversation";
  }

  let title = firstUserMsg.text.trim();

  // Remove leading question words for cleaner titles
  title = title.replace(/^(what|how|why|when|where|which|who|can|could|would|should|do|does|is|are|will)\s+/i, "");

  // Remove trailing punctuation
  title = title.replace(/[?!.]+$/, "");

  // Truncate to max length
  if (title.length > FALLBACK_MAX_LENGTH) {
    title = title.substring(0, FALLBACK_MAX_LENGTH).trim();
    // Try to break at a word boundary
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > FALLBACK_MAX_LENGTH * 0.6) {
      title = title.substring(0, lastSpace);
    }
  }

  // Capitalize first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return title || "New Conversation";
}
