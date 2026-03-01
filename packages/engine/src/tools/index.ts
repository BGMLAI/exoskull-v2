import type { ToolDefinition } from "@exoskull/types";
import { CORE_TOOLS } from "./core";
import { KNOWLEDGE_TOOLS } from "./knowledge";
import { COMMUNICATION_TOOLS } from "./communication";
import { ADMIN_TOOLS } from "./admin";
import { APPS_TOOLS } from "./apps";
import { VOICE_TOOLS } from "./voice";
import { SELF_MODIFY_TOOLS } from "./self-modify";

export { CORE_TOOLS } from "./core";
export { KNOWLEDGE_TOOLS } from "./knowledge";
export { COMMUNICATION_TOOLS } from "./communication";
export { ADMIN_TOOLS } from "./admin";
export { APPS_TOOLS } from "./apps";
export { VOICE_TOOLS } from "./voice";
export { SELF_MODIFY_TOOLS } from "./self-modify";

/**
 * Three-tier tool loading:
 * - Core (always loaded): goals, tasks, memory, discovery (~8 tools)
 * - Pack (loaded by default): knowledge, comms, admin, apps (~20 tools)
 * - Extended (via discover_tools + build_tool): dynamic tools from DB
 */
export function getAllTools(): ToolDefinition[] {
  return [
    ...CORE_TOOLS,
    ...KNOWLEDGE_TOOLS,
    ...COMMUNICATION_TOOLS,
    ...ADMIN_TOOLS,
    ...APPS_TOOLS,
    ...VOICE_TOOLS,
    ...SELF_MODIFY_TOOLS,
  ];
}

export function getCoreTools(): ToolDefinition[] {
  return CORE_TOOLS;
}

export function getToolsByTier(tier: "core" | "pack" | "extended"): ToolDefinition[] {
  return getAllTools().filter((t) => (t.tier || "core") === tier);
}
