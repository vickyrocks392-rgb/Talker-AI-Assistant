/**
 * Tool executor for the Talker AI Tool Engine.
 *
 * The executor receives a {@link ToolRequest} from the planner, looks up
 * the tool in the registry, and calls `tool.execute(args)`.  It returns
 * a strongly typed {@link ToolResult}.
 *
 * This layer decouples the planner from tool execution — the planner
 * only decides *which* tool to call, the executor handles the mechanics.
 */

import type { ToolRequest, ToolResult } from "./types";
import { ToolRegistry } from "./registry";
import { createLogger } from "../../utils/logger";

const logger = createLogger("ToolExecutor");

/**
 * Execute a tool request by looking up the tool in the registry and
 * calling its `execute` method.
 *
 * @param request – A fully resolved tool invocation from the planner.
 * @returns A promise that resolves to a {@link ToolResult}.
 */
export async function executeTool(request: ToolRequest): Promise<ToolResult> {
  const registry = ToolRegistry.getInstance();
  const tool = registry.get(request.toolName);

  if (!tool) {
    const error = `Unknown tool: "${request.toolName}". ` +
      `Available: ${registry.list().map((t) => t.name).join(", ") || "(none)"}`;
    logger.error(error);
    return { success: false, error };
  }

  logger.info(
    `Executing tool: ${request.toolName}` +
    `${Object.keys(request.args).length > 0 ? ` with args: ${JSON.stringify(request.args)}` : ""}`,
  );

  try {
    const result = await tool.execute(request.args);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Tool "${request.toolName}" threw an error: ${message}`);
    return { success: false, error: message };
  }
}