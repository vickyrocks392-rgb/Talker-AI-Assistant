/**
 * Orchestrator — the main entry point for the Intelligent Orchestration Layer.
 *
 * The Orchestrator sits between ConversationService and ContextBuilder.
 * It analyses each user request and produces an ExecutionPlan that tells
 * the ContextBuilder which context sources to activate and which to skip.
 *
 * Flow:
 *   ConversationService
 *     → Orchestrator.orchestrate(input)
 *     → PolicyEngine evaluates rules
 *     → Planner refines with runtime context
 *     → ExecutionPlan returned
 *     → ContextBuilder consumes plan
 *     → Provider
 *     → Persist Memory
 *
 * The Orchestrator is deterministic — no LLM calls are made.
 * All decisions are based on pattern matching and runtime state.
 */

import { createLogger } from "../../utils/logger";
import { createExecutionPlan } from "./planner";
import type { ExecutionPlan, OrchestratorResult } from "./types";

const logger = createLogger("Orchestrator");

/**
 * Orchestrate a user request by producing an execution plan.
 *
 * @param input - The user's raw text input.
 * @returns The orchestration result containing the execution plan and timing.
 */
export async function orchestrate(input: string): Promise<OrchestratorResult> {
  logger.debug(`Orchestrating request: "${input.slice(0, 100)}..."`);

  const result = await createExecutionPlan(input);

  logger.info(
    `Orchestration result: mode=${result.plan.mode}, ` +
    `memory=${result.plan.useMemory}, rag=${result.plan.useRag}, ` +
    `tools=${result.plan.useTools}, tool=${result.plan.tool ?? "none"}, ` +
    `reason="${result.plan.reason}"`,
  );

  return result;
}

/**
 * Quick check if a request is a tool-only request.
 * Useful for short-circuiting the full pipeline.
 */
export function isToolOnlyRequest(plan: ExecutionPlan): boolean {
  return plan.mode === "tool_only" && plan.useTools && !!plan.tool;
}

/**
 * Quick check if a request is a RAG-only request.
 */
export function isRagOnlyRequest(plan: ExecutionPlan): boolean {
  return plan.mode === "rag_only" && plan.useRag;
}

/**
 * Quick check if a request is a memory-only request.
 */
export function isMemoryOnlyRequest(plan: ExecutionPlan): boolean {
  return plan.mode === "memory_only" && plan.useMemory;
}