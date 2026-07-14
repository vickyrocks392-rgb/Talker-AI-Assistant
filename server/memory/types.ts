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
  /** Whether the title was auto-generated (0 = manual/managed, 1 = auto-generated) */
  titleGenerated?: number;
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

/**
 * A global memory entry — a Q&A pair that persists across all conversations
 * for the same user. This is user-scoped memory, separate from conversation-
 * scoped memory.
 */
export interface GlobalMemoryEntry {
  id: string;
  query: string;
  answer: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  /** Optional comma-separated tags for categorisation */
  tags?: string;
}
