import type { ToolDefinition } from "@exoskull/types";
import { CORE_TOOLS } from "./core";
import { KNOWLEDGE_TOOLS } from "./knowledge";
import { COMMUNICATION_TOOLS } from "./communication";
import { ADMIN_TOOLS } from "./admin";

export { CORE_TOOLS } from "./core";
export { KNOWLEDGE_TOOLS } from "./knowledge";
export { COMMUNICATION_TOOLS } from "./communication";
export { ADMIN_TOOLS } from "./admin";

/**
 * Three-tier tool loading:
 * - Core (always loaded): goals, tasks, memory, discovery (~8 tools)
 * - Pack (loaded by default, can be trimmed for voice): knowledge, comms, admin (~8 tools)
 * - Extended (via discover_tools): dynamic tools from DB (future)
 */
export function getAllTools(): ToolDefinition[] {
  return [
    ...CORE_TOOLS,
    ...KNOWLEDGE_TOOLS,
    ...COMMUNICATION_TOOLS,
    ...ADMIN_TOOLS,
  ];
}

export function getCoreTools(): ToolDefinition[] {
  return CORE_TOOLS;
}

export function getToolsByTier(tier: "core" | "pack" | "extended"): ToolDefinition[] {
  return getAllTools().filter((t) => (t.tier || "core") === tier);
}
