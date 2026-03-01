import type { ToolDefinition } from "@exoskull/types";

export type { ToolDefinition };

export interface ToolExecutionResult {
  result: string;
  isError: boolean;
  durationMs: number;
}

export const MAX_TOOL_RESULT_LENGTH = 50_000;
