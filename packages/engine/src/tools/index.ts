import type { ToolDefinition } from "@exoskull/types";
import { CORE_TOOLS } from "./core";

export { CORE_TOOLS } from "./core";

export function getAllTools(): ToolDefinition[] {
  return [...CORE_TOOLS];
}
