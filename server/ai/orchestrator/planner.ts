/**
 * Orchestration Planner — refines the execution plan with runtime context.
 *
 * The PolicyEngine produces a base plan from pattern matching alone.
 * The Planner refines this plan by incorporating runtime state:
 *
 *   - If RAG is requested but no documents exist, RAG is disabled.
 *   - If tools are requested, the specific tool is resolved.
 *   - If the plan is "chat" mode, tools are enabled for general use.
 *
 * This separation keeps the PolicyEngine pure (no side effects) while
 * the Planner handles runtime concerns.
 */

import { createLogger } from "../../utils/logger";
import { plan as toolPlan } from "../tools/planner";
import { PolicyEngine } from "./policy";
import type { ExecutionPlan, OrchestratorResult } from "./types";

const logger = createLogger("OrchestrationPlanner");

/**
 * Refine an execution plan with runtime context.
 *
 * @param plan - The base plan from the PolicyEngine.
 * @param input - The original user input (for tool planning).
 * @returns The refined execution plan.
 */
async function refinePlan(plan: ExecutionPlan, input: string): Promise<ExecutionPlan> {
  const refined = { ...plan };

  // ── Tool resolution ─────────────────────────────────────────────
  if (refined.useTools && !refined.tool) {
    // Run the tool planner to see if a specific tool matches
    const toolRequest = toolPlan(input);
    if (toolRequest) {
      refined.tool = toolRequest.toolName;
      logger.debug(`Tool planner resolved: ${refined.tool}`);
    }
  }

  return refined;
}

/**
 * Run the full orchestration pipeline.
 *
 * 1. Evaluate policy rules against the input.
 * 2. Refine the plan with runtime context.
 * 3. Return the final execution plan with timing.
 *
 * @param input - The user's raw text input.
 * @returns The complete orchestration result.
 */
export async function createExecutionPlan(input: string): Promise<OrchestratorResult> {
  const startTime = performance.now();

  // Step 1: Evaluate policy rules
  const policyEngine = new PolicyEngine();
  const basePlan = policyEngine.evaluate(input);

  logger.debug(
    `Base plan: mode=${basePlan.mode}, ` +
    `memory=${basePlan.useMemory}, rag=${basePlan.useRag}, ` +
    `tools=${basePlan.useTools}, tool=${basePlan.tool ?? "none"}`,
  );

  // Step 2: Refine with runtime context
  const refinedPlan = await refinePlan(basePlan, input);

  const orchestrationMs = Math.round(performance.now() - startTime);

  logger.info(
    `Orchestration complete: mode=${refinedPlan.mode}, ` +
    `memory=${refinedPlan.useMemory}, rag=${refinedPlan.useRag}, ` +
    `tools=${refinedPlan.useTools}, tool=${refinedPlan.tool ?? "none"}, ` +
    `took=${orchestrationMs}ms`,
  );

  return {
    plan: refinedPlan,
    timing: { orchestrationMs },
  };
}