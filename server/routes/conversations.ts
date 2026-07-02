/**
 * Conversation REST API — CRUD for conversations and their messages.
 *
 * All persistence is delegated to the MemoryService singleton.
 * Routes never call the repository directly.
 */

import { Router } from "express";
import { memoryService } from "../memory/service";
import { createLogger } from "../utils/logger";
import { ValidationError } from "../utils/errors";
import type { Conversation } from "../memory/types";

const logger = createLogger("ConversationsRoute");
const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Assert that `value` is a non-empty string and return it trimmed.
 * Throws ValidationError (HTTP 400) otherwise.
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
 * Assert that `value` is a string (possibly empty) and return it trimmed.
 * Returns `undefined` if the value is not a string.
 */
function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

// ── GET /api/conversations ────────────────────────────────────────────

/**
 * List all conversations, most recently updated first.
 */
router.get("/api/conversations", (_req, res) => {
  logger.debug("Listing all conversations");

  const conversations = memoryService.listConversations();

  res.json(conversations);
});

// ── POST /api/conversations ───────────────────────────────────────────

/**
 * Create a new conversation.
 *
 * Body: { title?: string }
 * If no title is supplied, "New Conversation" is used.
 */
router.post("/api/conversations", (req, res) => {
  const title = optionalString(req.body?.title) ?? "New Conversation";

  logger.debug("Creating conversation", { title });

  const conversation = memoryService.createConversation(title);

  res.status(201).json(conversation);
});

// ── GET /api/conversations/:id ────────────────────────────────────────

/**
 * Get a conversation with all its messages.
 *
 * Returns 404 if the conversation does not exist.
 */
router.get("/api/conversations/:id", (req, res) => {
  const { id } = req.params;

  logger.debug("Fetching conversation", { id });

  const conversation = memoryService.getConversation(id);

  if (!conversation) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Conversation with id "${id}" not found.`,
      },
    });
    return;
  }

  const messages = memoryService.getMessages(id);

  res.json({ conversation, messages });
});

// ── PATCH /api/conversations/:id ──────────────────────────────────────

/**
 * Update a conversation's title.
 *
 * Body: { title: string }
 * Returns 400 if title is missing or empty.
 * Returns 404 if the conversation does not exist.
 */
router.patch("/api/conversations/:id", (req, res) => {
  const { id } = req.params;

  // Validate body
  if (!req.body || typeof req.body !== "object") {
    throw new ValidationError("Request body is required.");
  }

  const title = assertString(req.body.title, "title");

  logger.debug("Renaming conversation", { id, title });

  const conversation = memoryService.renameConversation(id, title);

  if (!conversation) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Conversation with id "${id}" not found.`,
      },
    });
    return;
  }

  res.json(conversation);
});

// ── DELETE /api/conversations/:id ─────────────────────────────────────

/**
 * Delete a conversation and all its messages.
 *
 * Returns 204 No Content on success.
 * Returns 404 if the conversation does not exist.
 */
router.delete("/api/conversations/:id", (req, res) => {
  const { id } = req.params;

  logger.debug("Deleting conversation", { id });

  const conversation = memoryService.getConversation(id);

  if (!conversation) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `Conversation with id "${id}" not found.`,
      },
    });
    return;
  }

  memoryService.deleteConversation(id);

  res.status(204).send();
});

export default router;