/**
 * Context formatting utilities.
 *
 * Responsible for formatting tool results, RAG context, and other
 * structured data into human-readable text suitable for injection
 * into the LLM prompt.
 *
 * These formatters are extracted from ConversationService to keep
 * prompt assembly concerns in the Context Builder subsystem.
 */

import type { ToolResult, CalculatorResult, DateTimeResult } from "../tools/types";
import type { RagContext } from "../rag/service";

// ── Tool result formatters ──────────────────────────────────────────

/**
 * Format a successful calculator result into readable text.
 */
function formatCalculatorOutput(data: CalculatorResult): string {
  return [
    `Expression:`,
    `${data.expression}`,
    ``,
    `Answer:`,
    `${data.result}`,
  ].join("\n");
}

/**
 * Format a successful date-time result into readable text.
 */
function formatDateTimeOutput(data: DateTimeResult): string {
  return [
    `Current Date:`,
    `${data.date}`,
    ``,
    `Current Time:`,
    `${data.time}`,
    ``,
    `Timezone:`,
    `${data.timezone}`,
    ``,
    `ISO Timestamp:`,
    `${data.iso}`,
  ].join("\n");
}

/**
 * Build a strongly-worded, tool-specific system prompt that tells the LLM
 * the tool output is authoritative and must be used to answer the user.
 *
 * The output is formatted as readable text, not raw JSON, so the LLM
 * can consume it naturally.
 *
 * To add a new tool, add a new `case` to the switch statement and a
 * corresponding `format*Output` function above.
 */
export function formatToolContext(
  toolName: string,
  result: ToolResult,
): string {
  // ── Authoritative preamble ──────────────────────────────────────
  const preamble =
    `A system tool has already been executed. ` +
    `The tool output below is authoritative. ` +
    `Do NOT say you cannot access this information. ` +
    `Do NOT ignore this tool result. ` +
    `Do NOT recalculate or invent values. ` +
    `Use this tool result to answer the user's question naturally.`;

  // ── Tool-specific body ──────────────────────────────────────────
  let body: string;

  if (!result.success) {
    // Tool failed — report the error clearly
    body = `Error: ${(result as { success: false; error: string }).error}`;
  } else {
    switch (toolName) {
      case "calculator":
        body = formatCalculatorOutput(
          (result as { success: true; data: CalculatorResult }).data,
        );
        break;

      case "datetime":
        body = formatDateTimeOutput(
          (result as { success: true; data: DateTimeResult }).data,
        );
        break;

      default:
        // Fallback for future tools: show the raw data
        body = JSON.stringify(
          (result as { success: true; data: unknown }).data,
          null,
          2,
        );
        break;
    }
  }

  return [
    preamble,
    ``,
    `Tool:`,
    `${toolName}`,
    ``,
    `Tool Output:`,
    body,
  ].join("\n");
}

// ── RAG context formatter ───────────────────────────────────────────

/**
 * Format RAG context into a system message string.
 *
 * @param ragContext - The RAG context from RagService.
 * @returns Formatted context string for injection.
 */
export function formatRagContext(ragContext: RagContext): string {
  // The RagService already formats the context internally,
  // so we just return it as-is with a wrapper.
  return ragContext.context;
}
