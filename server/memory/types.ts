/**
 * Persistent Memory type definitions.
 *
 * These interfaces represent the core domain entities for
 * conversation and message storage in SQLite.
 */

export interface ChatAttachment {
  documentId: string;
  filename: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Active documents for this conversation (persisted for conversation-level document memory) */
  activeDocuments?: ChatAttachment[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  /** Optional file attachments associated with this message */
  attachments?: ChatAttachment[];
}