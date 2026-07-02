/**
 * Calculator tool for the Talker AI Tool Engine.
 *
 * Performs basic arithmetic: addition, subtraction, multiplication,
 * and division.  Returns a structured result with the expression
 * string and computed value.
 *
 * ── Supported operators ────────────────────────────────────────────
 *   +   Addition
 *   -   Subtraction
 *   *   Multiplication
 *   /   Division
 *
 * ── Error handling ─────────────────────────────────────────────────
 * Division by zero returns `{ success: false, error: "..." }`.
 * Unknown operators return `{ success: false, error: "..." }`.
 */

import type { Tool, CalculatorResult, BinaryOperator } from "./types";

export class CalculatorTool implements Tool<CalculatorResult> {
  readonly name = "calculator";
  readonly description = "Performs basic arithmetic (+, -, *, /) on two numbers";

  async execute(args: Record<string, unknown>): Promise<
    | { success: true; data: CalculatorResult }
    | { success: false; error: string }
  > {
    // ── Validate arguments ──────────────────────────────────────
    const a = typeof args.a === "number" ? args.a : NaN;
    const b = typeof args.b === "number" ? args.b : NaN;

    if (isNaN(a) || isNaN(b)) {
      return {
        success: false,
        error: `Invalid arguments: a and b must be numbers (got a=${JSON.stringify(args.a)}, b=${JSON.stringify(args.b)})`,
      };
    }

    const operator = args.operator as BinaryOperator;
    const validOps: BinaryOperator[] = ["+", "-", "*", "/"];

    if (!validOps.includes(operator)) {
      return {
        success: false,
        error: `Unsupported operator: "${operator}". Supported: ${validOps.join(", ")}`,
      };
    }

    // ── Compute ─────────────────────────────────────────────────
    let result: number;

    switch (operator) {
      case "+":
        result = a + b;
        break;
      case "-":
        result = a - b;
        break;
      case "*":
        result = a * b;
        break;
      case "/":
        if (b === 0) {
          return { success: false, error: "Division by zero is undefined" };
        }
        result = a / b;
        break;
    }

    // Format the expression for readability
    const expression = `${a} ${operator} ${b}`;

    return {
      success: true,
      data: { expression, result },
    };
  }
}