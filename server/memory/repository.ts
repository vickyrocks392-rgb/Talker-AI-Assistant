/**
 * Memory repository layer.
 *
 * Responsible ONLY for database access. No business logic.
 * All methods use prepared statements and UUIDs for IDs.
 */

import { v4 as uuidv4 } from "uuid";
import { getDatabase } from "../db/database";
import { createLogger } from "../utils/logger";
import type { Conversation, Message, ChatAttachment, GlobalMemoryEntry } from "./types";

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
    INSERT INTO conversations (id, title, created_at, updated_at, title_generated)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Mark as title_generated=1 if this is the default "New Conversation" title
  const isGenerated = title === "New Conversation" ? 1 : 0;
  stmt.run(id, title, now, now, isGenerated);

  console.log(`[TitleGenerator] Conversation created: id=${id}, title="${title}", title_generated=${isGenerated}`);

  return { id, title, createdAt: now, updatedAt: now, titleGenerated: isGenerated, activeDocuments: [] };
}

/**
 * Retrieves a single conversation by ID, or undefined if not found.
 */
export function getConversation(id: string): Conversation | undefined {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, active_documents AS activeDocuments, title_generated AS titleGenerated
    FROM conversations
    WHERE id = ?
  `);

  const row = stmt.get(id) as {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    activeDocuments: string | null;
    titleGenerated: number | null;
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
    titleGenerated: row.titleGenerated ?? 0,
    activeDocuments: filteredDocs,
  };
}

/**
 * Lists all conversations ordered by most recently updated first.
 */
export function listConversations(): Conversation[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, active_documents AS activeDocuments, title_generated AS titleGenerated
    FROM conversations
    ORDER BY updated_at DESC
  `);

  const rows = stmt.all() as Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    activeDocuments: string | null;
    titleGenerated: number | null;
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
      titleGenerated: row.titleGenerated ?? 0,
      activeDocuments: filteredDocs,
    };
  });
}

/**
 * Renames a conversation (manual rename). Sets title_generated=0 to
 * prevent auto-generation from overwriting this title.
 * Returns the updated conversation, or undefined if not found.
 */
export function renameConversation(
  id: string,
  title: string
): Conversation | undefined {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?, title_generated = 0
    WHERE id = ?
  `);

  const result = stmt.run(title, now, id);

  if (result.changes === 0) {
    return undefined;
  }

  return getConversation(id);
}

/**
 * Updates a conversation's title but preserves the title_generated flag.
 * Used for auto-generated titles — only updates if the current title
 * is still "New Conversation" (i.e., title_generated = 1).
 * Returns the updated conversation, or undefined if not found or
 * if the conversation has been manually renamed (title_generated = 0).
 */
export function setConversationTitle(
  id: string,
  title: string,
): Conversation | undefined {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Only update if title_generated = 1 (i.e., still "New Conversation")
  const stmt = db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ? AND title_generated = 1
  `);

  logger.debug(`[TitleGenerator] Calling setConversationTitle(id=${id}, title="${title}")`);
  const result = stmt.run(title, now, id);
  logger.debug(`[TitleGenerator] Rows updated: ${result.changes}`);

  if (result.changes === 0) {
    // Check why — log the current state
    const check = db.prepare("SELECT id, title, title_generated FROM conversations WHERE id = ?").get(id) as { id: string; title: string; title_generated: number } | undefined;
    if (check) {
      logger.debug(`[TitleGenerator] setConversationTitle failed: current state — title="${check.title}", title_generated=${check.title_generated}`);
    } else {
      logger.debug(`[TitleGenerator] setConversationTitle failed: conversation ${id} not found`);
    }
    return undefined;
  }

  const updated = getConversation(id);
  if (updated) {
    logger.debug(`[TitleGenerator] Conversation title after update: "${updated.title}"`);
  }
  return updated;
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

// ══════════════════════════════════════════════════════════════════════
// Global Memory (site-wide, user-scoped Q&A pairs)
// ══════════════════════════════════════════════════════════════════════

/**
 * Saves a global memory entry (Q&A pair) that persists across all conversations
 * for the same user. If an entry with the same query already exists, it updates
 * the answer and increments the access count.
 *
 * @param query - The user's question text.
 * @param answer - The assistant's answer text.
 * @returns The saved global memory entry.
 */
export function saveGlobalMemory(query: string, answer: string): GlobalMemoryEntry {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  // Check if an entry with similar query already exists (case-insensitive exact match)
  const existing = db.prepare(`
    SELECT id, access_count FROM global_memory WHERE LOWER(query) = LOWER(?)
  `).get(query) as { id: string; access_count: number } | undefined;

  if (existing) {
    // Update existing entry
    const stmt = db.prepare(`
      UPDATE global_memory
      SET answer = ?, updated_at = ?, access_count = access_count + 1
      WHERE id = ?
    `);
    stmt.run(answer, now, existing.id);

    const updated = db.prepare(`
      SELECT id, query, answer, created_at AS createdAt, updated_at AS updatedAt,
             access_count AS accessCount, tags
      FROM global_memory WHERE id = ?
    `).get(existing.id) as GlobalMemoryEntry;

    return updated;
  }

  // Insert new entry
  const stmt = db.prepare(`
    INSERT INTO global_memory (id, query, answer, created_at, updated_at, access_count)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  stmt.run(id, query, answer, now, now);

  return {
    id,
    query,
    answer,
    createdAt: now,
    updatedAt: now,
    accessCount: 1,
  };
}

/**
 * Retrieves all global memory entries, ordered by most recently updated first.
 */
export function getAllGlobalMemory(): GlobalMemoryEntry[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, query, answer, created_at AS createdAt, updated_at AS updatedAt,
           access_count AS accessCount, tags
    FROM global_memory
    ORDER BY updated_at DESC
  `);

  return stmt.all() as GlobalMemoryEntry[];
}

/**
 * Retrieves a single global memory entry by ID.
 */
export function getGlobalMemoryById(id: string): GlobalMemoryEntry | undefined {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, query, answer, created_at AS createdAt, updated_at AS updatedAt,
           access_count AS accessCount, tags
    FROM global_memory WHERE id = ?
  `);

  return stmt.get(id) as GlobalMemoryEntry | undefined;
}

/**
 * Searches global memory for entries matching the given query text.
 * Uses simple LIKE-based keyword matching with relevance scoring.
 *
 * @param query - The search text.
 * @param limit - Maximum number of results to return (default 5).
 * @returns Array of matching entries with relevance scores, ordered by relevance.
 */
export function searchGlobalMemory(
  query: string,
  limit: number = 5,
): { entry: GlobalMemoryEntry; score: number }[] {
  const db = getDatabase();
  const allEntries = getAllGlobalMemory();

  if (allEntries.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryTokens = queryLower.split(/\s+/).filter((t) => t.length > 0);

  if (queryTokens.length === 0) {
    return [];
  }

  // Score each entry based on keyword overlap
  const scored: { entry: GlobalMemoryEntry; score: number }[] = [];

  for (const entry of allEntries) {
    const entryText = `${entry.query} ${entry.answer}`.toLowerCase();
    let matchCount = 0;

    for (const token of queryTokens) {
      if (entryText.includes(token)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Score = keyword match ratio + access count bonus (normalised)
      const keywordScore = matchCount / queryTokens.length;
      const accessBonus = Math.min(entry.accessCount / 10, 0.3); // up to 0.3 bonus
      const score = Math.min(keywordScore + accessBonus, 1.0);

      scored.push({ entry, score });
    }
  }

  // Sort by score descending, then by updated_at descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.updatedAt.localeCompare(a.entry.updatedAt);
  });

  return scored.slice(0, limit);
}

/**
 * Deletes a global memory entry by ID.
 * Returns true if deleted, false if not found.
 */
export function deleteGlobalMemory(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM global_memory WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}
