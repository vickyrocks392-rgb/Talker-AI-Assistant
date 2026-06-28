/**
 * Robust JSON parsing with recovery from common model output issues.
 * Handles markdown code fences, extra whitespace, brace-matching, and graceful fallbacks.
 */

import { ParseError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { ModelResponseParsed, MapAction } from "./types";

const logger = createLogger("Parser");

/**
 * Attempt to extract JSON from raw model output using brace-matching.
 * Handles:
 * - Markdown code fences (```json ... ```)
 * - Trailing/appended markdown and code blocks outside the JSON
 * - Braces inside string values
 */
function extractJson(rawText: string): string {
  let text = rawText.trim();

  // Remove markdown code fences
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
  const codeMatch = text.match(codeBlockRegex);
  if (codeMatch) {
    text = codeMatch[1].trim();
  }

  const jsonStart = text.indexOf("{");
  if (jsonStart === -1) {
    throw new ParseError(
      "No JSON object found in response",
      rawText
    );
  }

  // Character-by-character brace matching to locate the correct closing brace of the JSON
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonEnd = -1;

  for (let i = jsonStart; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) {
    throw new ParseError(
      "No matching closing brace found for JSON object",
      rawText
    );
  }

  return text.substring(jsonStart, jsonEnd + 1);
}

/**
 * Clean fallback text to prevent leaking raw JSON or JSON properties to the UI.
 */
function cleanFallbackText(rawText: string): string {
  // If the raw text contains JSON keys, let's try to extract the replyText value
  const replyTextMatch = rawText.match(/"replyText"\s*:\s*"([\s\S]*?)"/);
  if (replyTextMatch) {
    // Unescape common JSON escaped chars
    let text = replyTextMatch[1];
    text = text
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    return text.trim();
  }

  // If there's no replyText, but there is JSON-like structure (e.g. starting with {),
  // let's strip the JSON part and return the rest
  let text = rawText.trim();
  if (text.startsWith("{")) {
    const jsonEnd = text.indexOf("}");
    if (jsonEnd !== -1) {
      text = text.substring(jsonEnd + 1).trim();
    }
  }

  return text || "I had trouble processing my response. Let's try again!";
}

/**
 * Parse chat response from model.
 * Returns parsed response with fallback for malformed JSON.
 */
export function parseChatResponse(rawText: string): ModelResponseParsed {
  try {
    const jsonStr = extractJson(rawText);
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (typeof parsed.replyText !== "string") {
      throw new Error("Missing or invalid 'replyText' field");
    }

    if (!parsed.mapAction || typeof parsed.mapAction.type !== "string") {
      throw new Error("Missing or invalid 'mapAction' field");
    }

    // Ensure mapAction has valid type
    const validTypes = ["search", "directions", "none"];
    if (!validTypes.includes(parsed.mapAction.type)) {
      logger.warn(`Invalid mapAction type: ${parsed.mapAction.type}, defaulting to "none"`);
      parsed.mapAction.type = "none";
    }

    return {
      replyText: parsed.replyText.trim(),
      mapAction: parsed.mapAction as MapAction,
    };
  } catch (error) {
    logger.warn("Failed to parse chat response, using fallback", {
      raw: rawText.substring(0, 100),
      error: error instanceof Error ? error.message : error,
    });

    // Graceful fallback: clean raw text of JSON formatting
    return {
      replyText: cleanFallbackText(rawText),
      mapAction: { type: "none" },
    };
  }
}

/**
 * Parse summarization response from model.
 * Returns summary string with fallback.
 */
export function parseSummaryResponse(rawText: string): string {
  try {
    const jsonStr = extractJson(rawText);
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.summary !== "string") {
      throw new Error("Invalid summary format");
    }

    const summary = parsed.summary.trim();
    if (summary.length === 0) {
      throw new Error("Empty summary");
    }

    return summary;
  } catch (error) {
    logger.warn("Failed to parse summary response, using fallback", {
      raw: rawText.substring(0, 100),
    });

    // Fallback summary
    return "Personal Companion Chat";
  }
}

/**
 * Incremental parser that extracts replyText tokens as they stream from the LLM.
 */
export class StreamReplyExtractor {
  private rawBuffer = "";
  private hasStarted = false;
  private hasEnded = false;
  private replyTextIndex = -1;
  private escapeNext = false;
  private parsedReplyText = "";

  /**
   * Append a new chunk of JSON text and return any newly decoded characters of replyText.
   */
  append(chunk: string): string {
    this.rawBuffer += chunk;

    if (!this.hasStarted) {
      // Find the start of "replyText" value
      // The JSON structure is expected to be {"replyText": "value..."
      const match = this.rawBuffer.match(/"replyText"\s*:\s*"/);
      if (match && match.index !== undefined) {
        this.replyTextIndex = match.index + match[0].length;
        this.hasStarted = true;
        // Start parsing from the end of the match
        return this.processFrom(this.replyTextIndex);
      }
      return "";
    }

    if (!this.hasEnded) {
      return this.processFrom(this.replyTextIndex + this.parsedReplyText.length);
    }

    return "";
  }

  private processFrom(startIndex: number): string {
    let newChars = "";
    for (let i = startIndex; i < this.rawBuffer.length; i++) {
      const char = this.rawBuffer[i];

      if (this.escapeNext) {
        // Handle standard JSON escape sequences
        if (char === "n") newChars += "\n";
        else if (char === "t") newChars += "\t";
        else if (char === "r") newChars += "\r";
        else if (char === "b") newChars += "\b";
        else if (char === "f") newChars += "\f";
        else newChars += char; // \" or \\ etc.
        
        this.parsedReplyText += char;
        this.escapeNext = false;
        continue;
      }

      if (char === "\\") {
        this.escapeNext = true;
        this.parsedReplyText += char;
        continue;
      }

      if (char === '"') {
        // We reached the end of the replyText string!
        this.hasEnded = true;
        break;
      }

      newChars += char;
      this.parsedReplyText += char;
    }
    return newChars;
  }
}
