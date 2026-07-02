/**
 * Persistent Memory type definitions.
 *
 * These interfaces represent the core domain entities for
 * conversation and message storage in SQLite.
 */

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
}