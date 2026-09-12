import type { ToolResult } from "../types/index.js";
import { isAppError, toFailureResult } from "../utils/errors.js";
import { createRequestId, logger } from "../utils/logger.js";

export function toolJsonResult(payload: ToolResult): {
  content: { type: "text"; text: string }[];
  isError?: boolean;
} {
  const text = JSON.stringify(payload, null, 2);
  if (!payload.success) {
    return { content: [{ type: "text", text }], isError: true };
  }
  return { content: [{ type: "text", text }] };
}

export async function runTool<T extends ToolResult>(
  tool: string,
  execute: () => Promise<T>,
): Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
}> {
  const requestId = createRequestId();
  const started = Date.now();

  logger.info(`${tool} started`, { tool, requestId });

  try {
    const result = await execute();
    logger.info(`${tool} completed`, {
      tool,
      requestId,
      durationMs: Date.now() - started,
      success: true,
    });
    return toolJsonResult(result);
  } catch (error) {
    const failure = isAppError(error)
      ? error.toFailure()
      : toFailureResult(error);

    logger.error(`${tool} failed`, {
      tool,
      requestId,
      durationMs: Date.now() - started,
      success: false,
      errorCode: failure.error.code,
    });

    return toolJsonResult(failure);
  }
}
