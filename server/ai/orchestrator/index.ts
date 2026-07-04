/**
 * Intelligent Orchestration Layer — barrel export.
 *
 * The Orchestrator sits between ConversationService and ContextBuilder.
 * It analyses each user request and produces an ExecutionPlan that tells
 * the ContextBuilder which context sources to activate and which to skip.
 *
 * Usage:
 * ```ts
 * import { orchestrate } from "./orchestrator";
 *
 * const { plan } = await orchestrate("Hello!");
 * // plan = { useMemory: true, useRag: false, useTools: false, mode: "memory_only", ... }
 * ```
 */

export { orchestrate, isToolOnlyRequest, isRagOnlyRequest, isMemoryOnlyRequest } from "./orchestrator";
export { createExecutionPlan } from "./planner";
export { PolicyEngine } from "./policy";
export type {
  ExecutionPlan,
  ExecutionMode,
  PolicyRule,
  OrchestratorResult,
} from "./types";