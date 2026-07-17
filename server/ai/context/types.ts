/**
 * Type definitions for the Context Builder subsystem.
 *
 * The Context Builder is responsible for assembling the complete LLM context
 * (OllamaMessage[]) from the available sources: system prompt, conversation
 * memory, RAG knowledge, tool results, and the current user message.
 *
 * This module defines the input/output contracts and priority levels for
 * token budgeting.
 */

import type { OllamaMessage } from "../types";
import type { Persona, ConversationMessage } from "../types";
import type { ExecutionPlan } from "../orchestrator/types";
import type { ChatAttachment } from "../../../shared/types";

// ── Priority levels for token budgeting ─────────────────────────────

/**
 * Priority levels for context sections when token budgeting is applied.
 *
 * Higher-priority sections are preserved first when the total context
 * exceeds the budget. Lower-priority sections are truncated or dropped.
 */
export enum ContextPriority {
  /** Must always be included in full. */
  Critical = 0,
  /** Should be included in full if possible. */
  High = 1,
  /** Include if space permits, truncate oldest first. */
  Medium = 2,
  /** Drop or heavily truncate when over budget. */
  Low = 3,
}

// ── Input to the Context Builder ────────────────────────────────────

/**
 * Options for building the LLM context.
 */
export interface ContextBuilderOptions {
  /** The current user message text. */
  text: string;

  /** Conversation ID for loading persisted history. */
  conversationId?: string;

  /** Legacy history array (used when conversationId is not provided). */
  history?: ConversationMessage[];

  /** Optional persona for system prompt personalisation. */
  persona?: Persona;

  /** Maximum context size in characters (approximate token budget). */
  maxContextChars?: number;

  /**
   * Optional execution plan from the Orchestrator.
   * When provided, the Context Builder will only activate the context
   * sources specified in the plan, skipping unnecessary work.
   */
  executionPlan?: ExecutionPlan;

  /**
   * True when the current user message originated from voice input
   * (speech recognition). When set, a temporary system message is injected
   * immediately before the user message for THIS request only. It is never
   * persisted to memory or conversation history and does not affect future
   * messages.
   */
  isVoice?: boolean;
}

// ── Output from the Context Builder ─────────────────────────────────

/**
 * The result of assembling the LLM context.
 */
export interface ContextBuilderResult {
  /** Fully assembled messages ready for the AI provider. */
  messages: OllamaMessage[];

  /** Metadata about what was included. */
  metadata: ContextMetadata;
}

/**
 * Metadata about the assembled context.
 */
export interface ContextMetadata {
  /** Whether RAG context was injected. */
  hasRagContext: boolean;

  /** Number of RAG chunks retrieved (0 if none). */
  ragChunkCount: number;

  /** Average RAG relevance score (0 if none). */
  ragAvgScore: number;

  /** Whether global memory context was injected. */
  hasMemoryContext: boolean;

  /** Number of global memory entries retrieved (0 if none). */
  memoryEntryCount: number;

  /** Average global memory confidence score (0 if none). */
  memoryAvgConfidence: number;

  /** Whether a tool result was injected. */
  hasToolResult: boolean;

  /** Name of the tool that was executed (empty if none). */
  toolName: string;

  /** Whether the tool execution succeeded. */
  toolSuccess: boolean;

  /** Number of conversation history messages included. */
  historyMessageCount: number;

  /** Total character count of the assembled messages. */
  totalChars: number;
}

// ── Section descriptor for budgeting ────────────────────────────────

/**
 * Describes a single section of the context for budgeting purposes.
 */
export interface ContextSection {
  /** Human-readable label for logging/debugging. */
  label: string;

  /** The priority level for truncation decisions. */
  priority: ContextPriority;

  /** The content to include (may be truncated by the budgeter). */
  content: string;

  /** The role to assign to the resulting message. */
  role: "system" | "user" | "assistant";
}