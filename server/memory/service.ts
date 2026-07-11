/**
 * Memory service layer.
 *
 * Wraps repository methods with business logic concerns.
 * Exported as a singleton. No Express or route code here.
 */

import { createLogger } from "../utils/logger";

import {
  createConversation as repoCreateConversation,
  getConversation as repoGetConversation,
  listConversations as repoListConversations,
  renameConversation as repoRenameConversation,
  deleteConversation as repoDeleteConversation,
  saveMessage as repoSaveMessage,
  getMessages as repoGetMessages,
  setActiveDocuments as repoSetActiveDocuments,
  removeActiveDocument as repoRemoveActiveDocument,
  removeActiveDocumentFromAllConversations as repoRemoveActiveDocumentFromAllConversations,
  saveGlobalMemory as repoSaveGlobalMemory,
  getAllGlobalMemory as repoGetAllGlobalMemory,
  searchGlobalMemory as repoSearchGlobalMemory,
  deleteGlobalMemory as repoDeleteGlobalMemory,
} from "./repository";

import { qualifyForMemory } from "./qualifier";

import type { Conversation, Message, ChatAttachment, GlobalMemoryEntry } from "./types";

const logger = createLogger("MemoryService");

class MemoryService {
  /**
   * Creates a new conversation with the given title.
   */
  createConversation(title: string = "New conversation"): Conversation {
    return repoCreateConversation(title);
  }

  /**
   * Retrieves a conversation by ID.
   */
  getConversation(id: string): Conversation | undefined {
    return repoGetConversation(id);
  }

  /**
   * Lists all conversations, most recently updated first.
   */
  listConversations(): Conversation[] {
    return repoListConversations();
  }

  /**
   * Renames a conversation.
   */
  renameConversation(id: string, title: string): Conversation | undefined {
    return repoRenameConversation(id, title);
  }

  /**
   * Deletes a conversation and all its messages.
   */
  deleteConversation(id: string): boolean {
    return repoDeleteConversation(id);
  }

  /**
   * Saves a message to the given conversation.
   */
  saveMessage(
    conversationId: string,
    role: string,
    content: string,
    attachments?: ChatAttachment[]
  ): Message {
    return repoSaveMessage(conversationId, role, content, attachments);
  }

  /**
   * Retrieves all messages for a conversation.
   */
  getMessages(conversationId: string): Message[] {
    return repoGetMessages(conversationId);
  }

  /**
   * Sets the active documents for a conversation.
   * Used to persist the document list for conversation-level document memory.
   * Returns the merged active documents list.
   */
  setActiveDocuments(
    conversationId: string,
    activeDocuments: ChatAttachment[]
  ): ChatAttachment[] {
    logger.info(`[MemoryService.setActiveDocuments] Conversation ID: ${conversationId}`);
    logger.info(`[MemoryService.setActiveDocuments] Incoming attachments: ${JSON.stringify(activeDocuments.map((d) => d.documentId))}`);
    return repoSetActiveDocuments(conversationId, activeDocuments);
  }

  /**
   * Removes a document from the active documents list of a conversation.
   * Used when a document is deleted from the Knowledge Center.
   */
  removeActiveDocument(
    conversationId: string,
    documentId: string
  ): void {
    logger.info(`[MemoryService.removeActiveDocument] Conversation ID: ${conversationId}, Document ID: ${documentId}`);
    repoRemoveActiveDocument(conversationId, documentId);
  }

  /**
   * Removes a document from the active documents list of every conversation
   * that references it. Returns the number of active documents remaining in
   * the affected conversation.
   */
  removeActiveDocumentFromAllConversations(
    documentId: string
  ): number {
    logger.info(`[MemoryService.removeActiveDocumentFromAllConversations] Document ID: ${documentId}`);
    const remaining = repoRemoveActiveDocumentFromAllConversations(documentId);
    logger.info(`[MemoryService.removeActiveDocumentFromAllConversations] Remaining active documents: ${remaining}`);
    return remaining;
  }

  // ══════════════════════════════════════════════════════════════════
  // Global Memory (site-wide, user-scoped Q&A pairs)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Saves a Q&A pair to global memory for reuse across conversations.
   *
   * The Q&A pair is first run through the memory qualifier to determine
   * if it contains long-term useful knowledge. Low-value entries
   * (greetings, acknowledgements, filler, etc.) are silently rejected.
   *
   * @param query - The user's question text.
   * @param answer - The assistant's answer text.
   * @returns The saved global memory entry, or undefined if rejected by the qualifier.
   */
  saveGlobalMemory(query: string, answer: string): GlobalMemoryEntry | undefined {
    // Run the memory qualifier to filter out low-value entries
    const qualification = qualifyForMemory(query, answer);

    if (!qualification.shouldSave) {
      logger.debug(
        `[MemoryService.saveGlobalMemory] Rejected by qualifier: ${qualification.reason}`,
      );
      return undefined;
    }

    logger.info(
      `[MemoryService.saveGlobalMemory] Qualified (score: ${qualification.score.toFixed(3)}): "${query.substring(0, 80)}..."`,
    );

    return repoSaveGlobalMemory(query, answer);
  }

  /**
   * Retrieves all global memory entries.
   */
  getAllGlobalMemory(): GlobalMemoryEntry[] {
    return repoGetAllGlobalMemory();
  }

  /**
   * Searches global memory for entries relevant to the given query.
   * Returns scored results ordered by relevance.
   */
  searchGlobalMemory(query: string, limit?: number): { entry: GlobalMemoryEntry; score: number }[] {
    return repoSearchGlobalMemory(query, limit);
  }

  /**
   * Deletes a global memory entry by ID.
   */
  deleteGlobalMemory(id: string): boolean {
    return repoDeleteGlobalMemory(id);
  }
}

/**
 * Singleton instance of MemoryService.
 */
export const memoryService = new MemoryService();