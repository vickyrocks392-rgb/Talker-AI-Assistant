/**
 * Memory service layer.
 *
 * Wraps repository methods with business logic concerns.
 * Exported as a singleton. No Express or route code here.
 */

import {
  createConversation as repoCreateConversation,
  getConversation as repoGetConversation,
  listConversations as repoListConversations,
  renameConversation as repoRenameConversation,
  deleteConversation as repoDeleteConversation,
  saveMessage as repoSaveMessage,
  getMessages as repoGetMessages,
} from "./repository";

import type { Conversation, Message } from "./types";

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
    content: string
  ): Message {
    return repoSaveMessage(conversationId, role, content);
  }

  /**
   * Retrieves all messages for a conversation.
   */
  getMessages(conversationId: string): Message[] {
    return repoGetMessages(conversationId);
  }
}

/**
 * Singleton instance of MemoryService.
 */
export const memoryService = new MemoryService();