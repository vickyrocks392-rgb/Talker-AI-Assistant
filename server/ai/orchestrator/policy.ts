/**
 * Policy Engine — lightweight, modular rule engine for orchestration decisions.
 *
 * Each rule inspects the user's input and returns a partial execution plan.
 * Rules are evaluated in order. The first rule that produces a definitive
 * mode wins. If no rule matches, a default plan is returned.
 *
 * This is a deterministic rule engine — no LLM calls are made.
 * Rules are pure functions that pattern-match on the input text.
 *
 * ── Adding a new rule ───────────────────────────────────────────────
 *
 * 1. Create a new function that implements the PolicyRule interface.
 * 2. Add it to the `rules` array in the PolicyEngine constructor.
 *
 * That's it — no other changes needed.
 */

import { createLogger } from "../../utils/logger";
import type { ExecutionPlan, ExecutionMode, PolicyRule } from "./types";

const logger = createLogger("PolicyEngine");

// ── Default Plan ────────────────────────────────────────────────────

/**
 * Default execution plan when no rule matches.
 * Uses memory and normal chat, but skips RAG and tools.
 */
const DEFAULT_PLAN: ExecutionPlan = {
  useMemory: true,
  useRag: false,
  useTools: false,
  mode: "memory_only",
  reason: "Default: no specific rule matched",
};

// ── Helper: build a partial plan ────────────────────────────────────

function plan(
  mode: ExecutionMode,
  reason: string,
  overrides: Partial<ExecutionPlan> = {},
): Partial<ExecutionPlan> {
  return { mode, reason, ...overrides };
}

// ── Individual Rules ────────────────────────────────────────────────

/**
 * Rule: Calculator expressions.
 *
 * Matches simple arithmetic expressions like "2+2", "10 * 5", "100/4".
 * These should use the calculator tool only — no RAG, no memory.
 */
const calculatorRule: PolicyRule = {
  name: "calculator",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim();
    // Match simple arithmetic: number operator number
    const CALC_PATTERN = /^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/;
    if (CALC_PATTERN.test(trimmed)) {
      return plan("tool_only", "Calculator expression detected", {
        useMemory: false,
        useRag: false,
        useTools: true,
        tool: "calculator",
      });
    }
    return null;
  },
};

/**
 * Rule: Date/time questions.
 *
 * Matches questions about the current date, time, or timestamp.
 * These should use the datetime tool only — no RAG, no memory.
 */
const dateTimeRule: PolicyRule = {
  name: "datetime",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    // Quick rejection: skip long sentences that happen to contain a keyword
    if (trimmed.split(/\s+/).length > 20) return null;

    const DATETIME_PATTERNS = [
      /what(?:\s+is)?\s+(?:the\s+)?(?:current\s+)?(?:date|time|timestamp)/i,
      /(?:current\s+)?(?:date|time|timestamp)(?:\s+now)?/i,
      /what\s+time\s+is\s+it/i,
      /tell\s+me\s+(?:the\s+)?(?:date|time)/i,
      /what\s+(?:day|month|year)\s+is\s+it/i,
      /what\s+is\s+the\s+(?:date|time)/i,
    ];

    for (const pattern of DATETIME_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("tool_only", "Date/time question detected", {
          useMemory: false,
          useRag: false,
          useTools: true,
          tool: "datetime",
        });
      }
    }
    return null;
  },
};

/**
 * Rule: Greetings.
 *
 * Matches common greetings and salutations.
 * These should use memory for context but skip RAG and tools entirely.
 */
const greetingRule: PolicyRule = {
  name: "greeting",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    // Quick rejection: greetings are typically short
    if (trimmed.split(/\s+/).length > 8) return null;

    const GREETING_PATTERNS = [
      /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day))(?:[.!]*)$/i,
      /^(?:howdy|sup|yo|what's\s+up|whats\s+up|hey\s+there|hi\s+there|hello\s+there)$/i,
      /^(?:nice\s+to\s+meet\s+you|pleased\s+to\s+meet\s+you)$/i,
    ];

    for (const pattern of GREETING_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("memory_only", "Greeting detected — no RAG, no tools", {
          useMemory: true,
          useRag: false,
          useTools: false,
        });
      }
    }
    return null;
  },
};

/**
 * Rule: Resume/CV questions.
 *
 * Matches questions about resumes, CVs, or uploaded documents.
 * These should use RAG to retrieve relevant document context.
 */
const resumeRule: PolicyRule = {
  name: "resume_question",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    const RESUME_PATTERNS = [
      /resume|résumé|cv\b|curriculum\s*vitae/i,
      /my\s+(?:resume|résumé|cv)/i,
      /about\s+(?:my\s+)?(?:background|experience|skills|qualifications)/i,
      /what\s+(?:do\s+you\s+)?know\s+about\s+me/i,
      /tell\s+me\s+about\s+(?:my\s+)?(?:resume|résumé|cv|background|profile)/i,
      /what\s+(?:are|is)\s+(?:my\s+)?(?:skills|qualifications|background|experience)/i,
    ];

    for (const pattern of RESUME_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("rag_only", "Resume/CV question detected", {
          useMemory: true,
          useRag: true,
          useTools: false,
        });
      }
    }
    return null;
  },
};

/**
 * Rule: PDF/document questions.
 *
 * Matches questions about uploaded documents, PDFs, or files.
 * These should use RAG to retrieve relevant document context.
 */
const documentRule: PolicyRule = {
  name: "document_question",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    const DOC_PATTERNS = [
      /document|pdf\b|file\b|upload/i,
      /what\s+(?:does|is)\s+(?:the\s+)?document/i,
      /summarize\s+(?:the\s+)?(?:document|pdf|file)/i,
      /what\s+(?:is\s+)?in\s+(?:the\s+)?(?:document|pdf|file)/i,
      /read\s+(?:the\s+)?(?:document|pdf|file)/i,
    ];

    for (const pattern of DOC_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("rag_only", "Document/PDF question detected", {
          useMemory: true,
          useRag: true,
          useTools: false,
        });
      }
    }
    return null;
  },
};

/**
 * Rule: Programming questions.
 *
 * Matches programming-related questions.
 * These should use memory but skip RAG (unless documents exist — handled
 * by the orchestrator merging logic) and may use tools.
 */
const programmingRule: PolicyRule = {
  name: "programming_question",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    const PROG_PATTERNS = [
      /write\s+(?:a\s+)?(?:function|program|script|code|class|method)/i,
      /how\s+(?:do\s+)?i\s+(?:write|implement|code|create|build)/i,
      /explain\s+(?:this\s+)?(?:code|function|algorithm|program)/i,
      /debug\s+(?:this\s+)?(?:code|function|program)/i,
      /what\s+(?:does\s+)?this\s+(?:code|function)\s+(?:do|mean)/i,
      /fix\s+(?:this\s+)?(?:bug|error|issue|code)/i,
      /refactor\s+(?:this\s+)?(?:code|function)/i,
      /python|javascript|typescript|java|c\+\+|rust|golang|ruby|php|swift|kotlin/i,
    ];

    for (const pattern of PROG_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("chat", "Programming question detected — no RAG unless documents exist", {
          useMemory: true,
          useRag: false, // Will be overridden if documents exist
          useTools: true,
        });
      }
    }
    return null;
  },
};

/**
 * Rule: Small talk / casual conversation.
 *
 * Matches casual conversation patterns.
 * These should use memory only — no RAG, no tools.
 */
const smallTalkRule: PolicyRule = {
  name: "small_talk",
  evaluate(input: string): Partial<ExecutionPlan> | null {
    const trimmed = input.trim().toLowerCase();

    // Quick rejection: small talk is typically short
    if (trimmed.split(/\s+/).length > 15) return null;

    const SMALL_TALK_PATTERNS = [
      /how\s+(?:are\s+)?(?:you|things|it\s+going)/i,
      /what's\s+up|whats\s+up/i,
      /how's\s+(?:it\s+)?going|how\s+are\s+you\s+doing/i,
      /(?:i'?m\s+)?(?:fine|good|great|doing\s+well)/i,
      /what\s+(?:are\s+)?you\s+(?:doing|up\s+to)/i,
      /tell\s+me\s+(?:a\s+)?(?:joke|story|fun\s+fact)/i,
      /how\s+(?:was|is)\s+your\s+day/i,
      /have\s+a\s+good\s+day/i,
      /thanks|thank\s+you|thx|ty/i,
      /bye|goodbye|see\s+(?:you|ya)|later/i,
    ];

    for (const pattern of SMALL_TALK_PATTERNS) {
      if (pattern.test(trimmed)) {
        return plan("memory_only", "Small talk detected — memory only", {
          useMemory: true,
          useRag: false,
          useTools: false,
        });
      }
    }
    return null;
  },
};

// ── Policy Engine ───────────────────────────────────────────────────

/**
 * Lightweight rule engine that evaluates user input against a set of
 * policy rules and produces an execution plan.
 *
 * Rules are evaluated in order. The first rule that produces a definitive
 * mode wins. If no rule matches, a default plan is returned.
 *
 * The engine is fully deterministic — no LLM calls are made.
 */
export class PolicyEngine {
  private readonly rules: PolicyRule[];

  constructor() {
    this.rules = [
      // Most specific rules first
      calculatorRule,
      dateTimeRule,
      greetingRule,
      resumeRule,
      documentRule,
      programmingRule,
      smallTalkRule,
    ];

    logger.info(
      `PolicyEngine initialized with ${this.rules.length} rules: ` +
      `${this.rules.map((r) => r.name).join(", ")}`,
    );
  }

  /**
   * Evaluate the input against all rules and produce an execution plan.
   *
   * @param input - The user's raw text input.
   * @returns A complete execution plan.
   */
  evaluate(input: string): ExecutionPlan {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        ...DEFAULT_PLAN,
        reason: "Empty input — using default plan",
      };
    }

    // Evaluate rules in order
    for (const rule of this.rules) {
      try {
        const result = rule.evaluate(trimmed);
        if (result && result.mode) {
          // Merge the partial plan with defaults
          const plan: ExecutionPlan = {
            useMemory: result.useMemory ?? DEFAULT_PLAN.useMemory,
            useRag: result.useRag ?? DEFAULT_PLAN.useRag,
            useTools: result.useTools ?? DEFAULT_PLAN.useTools,
            tool: result.tool,
            mode: result.mode,
            reason: result.reason ?? `Matched rule: ${rule.name}`,
          };

          logger.debug(
            `Rule "${rule.name}" matched: mode=${plan.mode}, ` +
            `memory=${plan.useMemory}, rag=${plan.useRag}, tools=${plan.useTools}`,
          );

          // TRACE LOGGING: Policy decision
          logger.info(`[TRACE 1] PolicyEngine.evaluate() called with input="${trimmed.slice(0, 80)}..."`);
          logger.info(`[TRACE 2] Rule "${rule.name}" matched: mode=${plan.mode}, useRag=${plan.useRag}, useMemory=${plan.useMemory}, useTools=${plan.useTools}`);
          logger.info(`[TRACE 3] Policy decision: RAG will ${plan.useRag ? 'BE USED' : 'NOT BE USED'} for this request`);

          return plan;
        }
      } catch (error) {
        logger.error(`Rule "${rule.name}" threw an error`, error);
        // Continue to next rule on error
      }
    }

    // No rule matched — return default
    logger.debug("No rule matched — using default plan");
    const defaultPlan = { ...DEFAULT_PLAN };
    logger.info(`[TRACE 1] PolicyEngine.evaluate() called with input="${trimmed.slice(0, 80)}..."`);
    logger.info(`[TRACE 2] No rule matched: mode=${defaultPlan.mode}, useRag=${defaultPlan.useRag}, useMemory=${defaultPlan.useMemory}, useTools=${defaultPlan.useTools}`);
    logger.info(`[TRACE 3] Policy decision: RAG will ${defaultPlan.useRag ? 'BE USED' : 'NOT BE USED'} for this request (default plan)`);
    return defaultPlan;
  }

  /**
   * Get the list of registered rules (for inspection and testing).
   */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Add a custom rule at runtime (for extensibility).
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    logger.info(`Added rule: ${rule.name}`);
  }
}