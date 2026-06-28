/**
 * Reusable request-body validators for the API routes.
 *
 * Each validator inspects the parsed request body and returns a strongly
 * typed projection or throws `ValidationError` (which the global error
 * handler renders as a consistent 400 response).
 */

import { ValidationError } from "./errors";
import type { ChatRequest, SummaryRequest } from "../ai/types";

interface TTSRequest {
  text: string;
}

/**
 * Assert that `value` is a non-empty string and return it.
 * Throws `ValidationError` otherwise.
 */
function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(
      `"${field}" is required and must be a non-empty string.`,
      field,
    );
  }
  return value.trim();
}

/**
 * Assert that `value` is an array (possibly empty).
 */
function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `"${field}" is required and must be an array.`,
      field,
    );
  }
  return value;
}

/**
 * Validate and coerce the body of a `POST /api/chat` request.
 *
 * Accepted body:
 *   { text: string; history?: ConversationMessage[]; persona?: Persona; stream?: boolean }
 */
export function validateChatRequest(body: Record<string, unknown>): ChatRequest & { stream?: boolean } {
  const text = assertString(body.text, "text");

  let history;
  if (body.history !== undefined) {
    history = assertArray(body.history, "history");
    // Accept any shape from the client; the server normalises roles below.
  }

  return {
    text,
    history: history as ChatRequest["history"],
    persona: body.persona as ChatRequest["persona"],
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
  };
}

/**
 * Validate and coerce the body of a `POST /api/summarize` request.
 */
export function validateSummaryRequest(body: Record<string, unknown>): SummaryRequest {
  const messages = assertArray(body.messages, "messages");

  if (messages.length === 0) {
    throw new ValidationError(
      '"messages" must be a non-empty array.',
      "messages",
    );
  }

  return { messages: messages as SummaryRequest["messages"] };
}

/**
 * Validate and coerce the body of a `POST /api/tts` request.
 */
export function validateTtsRequest(body: Record<string, unknown>): TTSRequest {
  const text = assertString(body.text, "text");
  return { text };
}
