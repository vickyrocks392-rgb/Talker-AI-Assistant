/**
 * Memory repository layer.
 *
 * Responsible ONLY for database access. No business logic.
 * All methods use prepared statements and UUIDs for IDs.
 */

import { v4 as uuidv4 } from "uuid";
import { getDatabase } from "../db/database";
import { createLogger } from "../utils/logger";
import type { Conversation, Message, ChatAttachment } from "./types";

const logger = createLogger("MemoryRepository");

/**
 * Retrieves all valid document IDs from the documents table.
 * Used to filter out references to deleted documents from conversation active documents.
 */
function getValidDocumentIds(): Set<string> {
  const db = getDatabase();
  const stmt = db.prepare("SELECT id FROM documents");
  const rows = stmt.all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

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

  return { id, title, createdAt: now, updatedAt: now, activeDocuments: [] };
}

/**
 * Retrieves a single conversation by ID, or undefined if not found.
 */
export function getConversation(id: string): Conversation | undefined {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, active_documents AS activeDocuments
    FROM conversations
    WHERE id = ?
  `);

  const row = stmt.get(id) as {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    activeDocuments: string | null;
  } | undefined;

  if (!row) {
    return undefined;
  }

  const retrievedDocs: ChatAttachment[] = row.activeDocuments ? JSON.parse(row.activeDocuments) as ChatAttachment[] : [];
  logger.info(`[getConversation] Conversation ${id} - Retrieved active docs: ${JSON.stringify(retrievedDocs.map((d) => d.documentId))}`);

  // Filter out documents that no longer exist in the documents table
  const validDocumentIds = getValidDocumentIds();
  const filteredDocs = retrievedDocs.filter((doc) => validDocumentIds.has(doc.documentId));
  
  // If filtering removed any documents, update the conversation to clean up stale references
  if (filteredDocs.length !== retrievedDocs.length) {
    logger.info(`[getConversation] Filtered out ${retrievedDocs.length - filteredDocs.length} deleted documents from conversation ${id}`);
    const updateStmt = db.prepare(`
      UPDATE conversations
      SET active_documents = ?
      WHERE id = ?
    `);
    const updatedJson = filteredDocs.length > 0 ? JSON.stringify(filteredDocs) : null;
    updateStmt.run(updatedJson, id);
  }

  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeDocuments: filteredDocs,
  };
}

/**
 * Lists all conversations ordered by most recently updated first.
 */
export function listConversations(): Conversation[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, active_documents AS activeDocuments
    FROM conversations
    ORDER BY updated_at DESC
  `);

  const rows = stmt.all() as Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    activeDocuments: string | null;
  }>;

  // Get valid document IDs once for filtering
  const validDocumentIds = getValidDocumentIds();

  return rows.map((row) => {
    const retrievedDocs: ChatAttachment[] = row.activeDocuments ? JSON.parse(row.activeDocuments) as ChatAttachment[] : [];
    
    // Filter out documents that no longer exist in the documents table
    const filteredDocs = retrievedDocs.filter((doc) => validDocumentIds.has(doc.documentId));
    
    // If filtering removed any documents, update the conversation to clean up stale references
    if (filteredDocs.length !== retrievedDocs.length) {
      logger.info(`[listConversations] Filtered out ${retrievedDocs.length - filteredDocs.length} deleted documents from conversation ${row.id}`);
      const updateStmt = db.prepare(`
        UPDATE conversations
        SET active_documents = ?
        WHERE id = ?
      `);
      const updatedJson = filteredDocs.length > 0 ? JSON.stringify(filteredDocs) : null;
      updateStmt.run(updatedJson, row.id);
    }
    
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activeDocuments: filteredDocs,
    };
  });
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
  content: string,
  attachments?: ChatAttachment[]
): Message {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  // Serialize attachments to JSON for storage
  const attachmentsJson = attachments && attachments.length > 0
    ? JSON.stringify(attachments)
    : null;

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at, attachments)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const touchConversation = db.prepare(`
    UPDATE conversations SET updated_at = ? WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    insertMessage.run(id, conversationId, role, content, now, attachmentsJson);
    touchConversation.run(now, conversationId);
  });

  transaction();

  return { id, conversationId, role, content, createdAt: now, attachments };
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
      created_at AS createdAt,
      attachments
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);

  const rows = stmt.all(conversationId) as Array<{
    id: string;
    conversationId: string;
    role: string;
    content: string;
    createdAt: string;
    attachments: string | null;
  }>;

  // Parse attachments JSON back to array
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    attachments: row.attachments ? JSON.parse(row.attachments) as ChatAttachment[] : undefined,
  }));
}

/**
 * Sets the active documents for a conversation.
 *
 * This MERGES the incoming attachments with the documents already persisted
 * for the conversation and deduplicates by `documentId`. It does NOT replace
 * the existing list, so uploading a new document in the same conversation
 * accumulates rather than overwrites previous active documents.
 *
 * This persists the document list for conversation-level document memory.
 */
export function setActiveDocuments(
  conversationId: string,
  activeDocuments: ChatAttachment[]
): ChatAttachment[] {
  const db = getDatabase();

  // ── Logging: inspect state before persistence ──────────────────────
  const existingStmt = db.prepare(`
    SELECT active_documents FROM conversations WHERE id = ?
  `);
  const existingRow = existingStmt.get(conversationId) as
    { active_documents: string | null } | undefined;
  const existingDocs: ChatAttachment[] = existingRow?.active_documents
    ? (JSON.parse(existingRow.active_documents) as ChatAttachment[])
    : [];
  logger.info(`[setActiveDocuments] Conversation ${conversationId} - Existing active docs: ${JSON.stringify(existingDocs.map((d) => d.documentId))}`);
  logger.info(`[setActiveDocuments] Incoming attachments: ${JSON.stringify(activeDocuments.map((d) => d.documentId))}`);
  // ── END logging ────────────────────────────────────────────────────

  // Merge existing + incoming, deduplicating by documentId (incoming wins
  // on conflict so refreshed metadata is preserved).
  const merged = [...existingDocs];
  for (const incoming of activeDocuments) {
    const idx = merged.findIndex((d) => d.documentId === incoming.documentId);
    if (idx >= 0) {
      merged[idx] = incoming;
    } else {
      merged.push(incoming);
    }
  }

  // Filter out any documents that no longer exist in the documents table
  const validDocumentIds = getValidDocumentIds();
  const filtered = merged.filter((doc) => validDocumentIds.has(doc.documentId));
  
  if (filtered.length !== merged.length) {
    logger.info(`[setActiveDocuments] Filtered out ${merged.length - filtered.length} deleted documents from incoming set`);
  }

  logger.info(`[setActiveDocuments] Persisted active docs: ${JSON.stringify(filtered.map((d) => d.documentId))}`);

  const activeDocumentsJson = filtered.length > 0
    ? JSON.stringify(filtered)
    : null;

  const stmt = db.prepare(`
    UPDATE conversations
    SET active_documents = ?
    WHERE id = ?
  `);

  stmt.run(activeDocumentsJson, conversationId);
  
  return filtered;
}

/**
 * Removes a document from the active documents list of a conversation.
 * Used when a document is deleted from the Knowledge Center.
 */
export function removeActiveDocument(
  conversationId: string,
  documentId: string
): void {
  const db = getDatabase();

  // Get current active documents
  const stmt = db.prepare(`
    SELECT active_documents FROM conversations WHERE id = ?
  `);

  const row = stmt.get(conversationId) as { active_documents: string | null } | undefined;

  if (!row || !row.active_documents) {
    logger.info(`[removeActiveDocument] Conversation ${conversationId} has no active documents`);
    return;
  }

  const currentDocs = JSON.parse(row.active_documents) as ChatAttachment[];
  logger.info(`[removeActiveDocument] Conversation ${conversationId} - Existing active docs: ${JSON.stringify(currentDocs.map((d) => d.documentId))}`);
  logger.info(`[removeActiveDocument] Removing document: ${documentId}`);

  const updatedDocs = currentDocs.filter((doc) => doc.documentId !== documentId);
  logger.info(`[removeActiveDocument] Final persisted active docs: ${JSON.stringify(updatedDocs.map((d) => d.documentId))}`);

  const updateStmt = db.prepare(`
    UPDATE conversations
    SET active_documents = ?
    WHERE id = ?
  `);

  const updatedJson = updatedDocs.length > 0
    ? JSON.stringify(updatedDocs)
    : null;

  updateStmt.run(updatedJson, conversationId);
}

/**
 * Removes a document from the active documents list of EVERY conversation
 * that references it. Used when a document is deleted from the Knowledge
 * Center so that no conversation can continue retrieving a deleted document.
 *
 * Runs inside a single transaction so the update is atomic across all
 * conversations. Returns the number of remaining active documents in the
 * conversation that was most recently associated with the document (or 0
 * if the document was not referenced by any conversation).
 *
 * @param documentId - The documentId to purge from all active document lists.
 * @returns The number of active documents remaining in the affected conversation.
 */
export function removeActiveDocumentFromAllConversations(
  documentId: string
): number {
  const db = getDatabase();

  const selectStmt = db.prepare(`
    SELECT id, active_documents FROM conversations WHERE active_documents IS NOT NULL
  `);

  const updateStmt = db.prepare(`
    UPDATE conversations SET active_documents = ? WHERE id = ?
  `);

  let remainingCount = 0;

  const transaction = db.transaction(() => {
    const rows = selectStmt.all() as Array<{ id: string; active_documents: string }>;

    for (const row of rows) {
      let currentDocs: ChatAttachment[] = [];
      try {
        currentDocs = JSON.parse(row.active_documents) as ChatAttachment[];
      } catch {
        currentDocs = [];
      }

      logger.info(`[removeActiveDocumentFromAllConversations] Conversation ${row.id} - Existing active docs: ${JSON.stringify(currentDocs.map((d) => d.documentId))}`);
      logger.info(`[removeActiveDocumentFromAllConversations] Removing document ${documentId} from conversation ${row.id}`);

      const updatedDocs = currentDocs.filter((doc) => doc.documentId !== documentId);

      if (updatedDocs.length !== currentDocs.length) {
        logger.info(`[removeActiveDocumentFromAllConversations] Conversation ${row.id} - Final persisted active docs: ${JSON.stringify(updatedDocs.map((d) => d.documentId))}`);
        const updatedJson = updatedDocs.length > 0
          ? JSON.stringify(updatedDocs)
          : null;
        updateStmt.run(updatedJson, row.id);
        // Track the remaining count for the last affected conversation.
        remainingCount = updatedDocs.length;
      }
    }
  });

  transaction();

  return remainingCount;
}
