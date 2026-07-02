/**
 * Memory repository layer.
 *
 * Responsible ONLY for database access. No business logic.
 * All methods use prepared statements and UUIDs for IDs.
 */

import { v4 as uuidv4 } from "uuid";
import { getDatabase } from "../db/database";
import type { Conversation, Message } from "./types";

/**
 * Creates a new conversation and returns it.
 */
export function createConversation(title: string): Conversation {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(id, title, now, now);

  return { id, title, createdAt: now, updatedAt: now };
}

/**
 * Retrieves a single conversation by ID, or undefined if not found.
 */
export function getConversation(id: string): Conversation | undefined {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
    FROM conversations
    WHERE id = ?
  `);

  return stmt.get(id) as Conversation | undefined;
}

/**
 * Lists all conversations ordered by most recently updated first.
 */
export function listConversations(): Conversation[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
    FROM conversations
    ORDER BY updated_at DESC
  `);

  return stmt.all() as Conversation[];
}

/**
 * Renames a conversation. Returns the updated conversation, or undefined
 * if the conversation does not exist.
 */
export function renameConversation(
  id: string,
  title: string
): Conversation | undefined {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ?
  `);

  const result = stmt.run(title, now, id);

  if (result.changes === 0) {
    return undefined;
  }

  return getConversation(id);
}

/**
 * Deletes a conversation and all its messages.
 * Returns true if the conversation was deleted, false if not found.
 */
export function deleteConversation(id: string): boolean {
  const db = getDatabase();

  const deleteMessages = db.prepare(`
    DELETE FROM messages WHERE conversation_id = ?
  `);

  const deleteConversation = db.prepare(`
    DELETE FROM conversations WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    deleteMessages.run(id);
    const result = deleteConversation.run(id);
    return result.changes > 0;
  });

  return transaction();
}

/**
 * Saves a message to a conversation and updates the conversation's
 * updated_at timestamp. Returns the saved message.
 */
export function saveMessage(
  conversationId: string,
  role: string,
  content: string
): Message {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const touchConversation = db.prepare(`
    UPDATE conversations SET updated_at = ? WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    insertMessage.run(id, conversationId, role, content, now);
    touchConversation.run(now, conversationId);
  });

  transaction();

  return { id, conversationId, role, content, createdAt: now };
}

/**
 * Retrieves all messages for a conversation, ordered by creation time.
 */
export function getMessages(conversationId: string): Message[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT
      id,
      conversation_id AS conversationId,
      role,
      content,
      created_at AS createdAt
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);

  return stmt.all(conversationId) as Message[];
}