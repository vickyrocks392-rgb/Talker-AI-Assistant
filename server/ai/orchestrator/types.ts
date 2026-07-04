/**
 * Type definitions for the Intelligent Orchestration Layer.
 *
 * The Orchestrator produces an ExecutionPlan that tells the Context Builder
 * which context sources to include and which to skip for each request.
 *
 * This eliminates unnecessary work (embeddings, vector queries, tool planning)
 * for requests that don't need them.
 */

// ── Execution Plan ──────────────────────────────────────────────────

/**
 * The mode of execution for the current request.
 * Determines the primary behaviour of the pipeline.
 */
export type ExecutionMode =
  | "chat"         // Normal chat with all appropriate context
  | "tool_only"    // Only execute a tool, skip RAG and memory
  | "rag_only"     // Only retrieve RAG context, skip tools
  | "memory_only"  // Only use conversation memory, skip RAG and tools
  | "direct";      // Minimal context, no RAG, no tools, no memory

/**
 * Structured execution plan produced by the Orchestrator.
 *
 * The Context Builder consumes this plan to decide which context
 * sources to activate and which to skip.
 */
export interface ExecutionPlan {
  /** Whether to load conversation history from memory. */
  useMemory: boolean;

  /** Whether to perform RAG retrieval and inject context. */
  useRag: boolean;

  /** Whether to run the tool planner and potentially execute a tool. */
  useTools: boolean;

  /**
   * Specific tool to execute (if useTools is true and a tool was matched).
   * If undefined but useTools is true, the planner will run normally.
   */
  tool?: string;

  /** The execution mode for logging and debugging. */
  mode: ExecutionMode;

  /** Human-readable reason for the decision (for debugging). */
  reason: string;
}

// ── Policy Rule ─────────────────────────────────────────────────────

/**
 * A single policy rule in the rule engine.
 *
 * Each rule inspects the input text and optionally returns a partial
 * execution plan. Rules are evaluated in order, and results are merged.
 * The first rule that returns a plan with a specific mode wins.
 */
export interface PolicyRule {
  /** Unique name for this rule (for logging and debugging). */
  name: string;

  /**
   * Evaluate the rule against the input text.
   *
   * @param input - The user's raw text input.
   * @returns A partial execution plan, or null if the rule does not apply.
   */
  evaluate(input: string): Partial<ExecutionPlan> | null;
}

// ── Orchestrator Result ─────────────────────────────────────────────

/**
 * The full result from the Orchestrator.
 */
export interface OrchestratorResult {
  /** The execution plan for the Context Builder. */
  plan: ExecutionPlan;

  /** Timing information for performance measurement. */
  timing: {
    /** Time taken for orchestration in milliseconds. */
    orchestrationMs: number;
  };
}