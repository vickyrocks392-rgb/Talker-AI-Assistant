/**
 * Singleton tool registry for the Talker AI Tool Engine.
 *
 * The registry is the single source of truth for all available tools.
 * Tools are registered once at startup and can be looked up by name
 * or enumerated for inspection / planner context.
 *
 * Usage:
 * ```ts
 * import { ToolRegistry } from "./registry";
 * import { CalculatorTool } from "./calculator";
 *
 * ToolRegistry.getInstance().register(new CalculatorTool());
 * ```
 */

import type { Tool } from "./types";
import { createLogger } from "../../utils/logger";

const logger = createLogger("ToolRegistry");

export class ToolRegistry {
  private static instance: ToolRegistry;
  private readonly tools: Map<string, Tool> = new Map();

  private constructor() {}

  // ── Singleton ───────────────────────────────────────────────────

  /** Return the singleton registry instance. */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  // ── Registration ────────────────────────────────────────────────

  /**
   * Register a tool so it can be looked up and executed.
   *
   * @throws if a tool with the same name is already registered.
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool "${tool.name}" is already registered. ` +
        `Use "list()" to see registered tools.`,
      );
    }
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name}`);
  }

  // ── Lookup ──────────────────────────────────────────────────────

  /**
   * Retrieve a registered tool by name.
   *
   * @returns The tool, or `undefined` if not found.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // ── Enumeration ─────────────────────────────────────────────────

  /**
   * Return a snapshot of all registered tools as an array.
   *
   * Each entry includes the tool's name and description — useful for
   * building planner context or debugging.
   */
  list(): { name: string; description: string }[] {
    const entries: { name: string; description: string }[] = [];
    for (const tool of this.tools.values()) {
      entries.push({ name: tool.name, description: tool.description });
    }
    return entries;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Remove all registered tools (useful for testing).
   */
  clear(): void {
    this.tools.clear();
    logger.info("Tool registry cleared");
  }
}