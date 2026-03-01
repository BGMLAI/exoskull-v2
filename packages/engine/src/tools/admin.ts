/**
 * Admin Tools — self-config, autonomy, integrations, discovery.
 */

import type { ToolDefinition } from "@exoskull/types";
import { updateTenant, getTenant, listConnections } from "@exoskull/store";

export const requestAutonomy: ToolDefinition = {
  name: "request_autonomy",
  description: "Request permission to perform an autonomous action. Presents the request to the user for approval.",
  input_schema: {
    type: "object",
    properties: {
      permission: { type: "string", description: "Permission to request (send_sms, send_email, outbound_call, build_app, connect_integration)" },
      reason: { type: "string", description: "Why this permission is needed" },
    },
    required: ["permission", "reason"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>): Promise<string> {
    return JSON.stringify({
      type: "permission_request",
      permission: input.permission,
      reason: input.reason,
      message: `I need your approval to enable "${input.permission}". Reason: ${input.reason}. Reply "yes" to grant.`,
    });
  },
};

export const listIntegrations: ToolDefinition = {
  name: "list_integrations",
  description: "List all connected external integrations (Google, Notion, etc.).",
  input_schema: {
    type: "object",
    properties: {},
  },
  tier: "core",
  async execute(_input: Record<string, unknown>, tenantId: string): Promise<string> {
    const connections = await listConnections(tenantId);
    if (connections.length === 0) return "No integrations connected yet.";

    return connections
      .map((c) => `- ${c.provider} (${c.kind}) — sync: ${c.sync_status}${c.sync_error ? ` [error: ${c.sync_error}]` : ""}`)
      .join("\n");
  },
};

export const discoverTools: ToolDefinition = {
  name: "discover_tools",
  description: "List all available tools with descriptions. Use this when you need a capability you don't see in your current tools.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Filter by category: core, knowledge, communication, admin, apps, all" },
    },
  },
  tier: "core",
  async execute(input: Record<string, unknown>): Promise<string> {
    // Dynamic import to avoid circular deps
    const { getAllTools } = await import("./index");
    const tools = getAllTools();
    const category = (input.category as string) || "all";

    const filtered = category === "all"
      ? tools
      : tools.filter((t) => {
          if (category === "core") return t.tier === "core";
          if (category === "knowledge") return t.name.includes("search") || t.name.includes("import") || t.name.includes("knowledge");
          if (category === "communication") return t.name.includes("sms") || t.name.includes("email") || t.name.includes("call");
          if (category === "admin") return t.name.includes("autonomy") || t.name.includes("integration") || t.name.includes("discover");
          return true;
        });

    return filtered
      .map((t) => `- **${t.name}** (${t.tier || "core"}): ${t.description}`)
      .join("\n");
  },
};

export const planAction: ToolDefinition = {
  name: "plan_action",
  description: "Plan a multi-step action sequence for a goal. Breaks down complex objectives into concrete steps with dependencies.",
  input_schema: {
    type: "object",
    properties: {
      objective: { type: "string", description: "What needs to be achieved" },
      constraints: { type: "string", description: "Any limitations or preferences" },
    },
    required: ["objective"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>): Promise<string> {
    // This tool is intentionally a "think out loud" tool.
    // The agent uses it to structure its planning before using other tools.
    return JSON.stringify({
      instruction: "Use this plan to execute steps using define_goal, add_task, and other tools.",
      objective: input.objective,
      constraints: input.constraints || "none",
      note: "Break into goals (depth 1-2) and tasks (depth 3), then execute each task.",
    });
  },
};

export const logData: ToolDefinition = {
  name: "log_data",
  description: "Log a data point for tracking (sleep, mood, exercise, expenses, etc.). Stored in memory as an episode.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Data category (sleep, mood, exercise, expense, custom)" },
      value: { type: "string", description: "The data value" },
      metadata: { type: "object", description: "Additional structured data" },
    },
    required: ["category", "value"],
  },
  tier: "pack",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const { insertMemory } = await import("@exoskull/store");
    const memory = await insertMemory({
      tenant_id: tenantId,
      kind: "episode",
      content: `[${input.category}] ${input.value}`,
      embedding: null,
      importance: 0.4,
      source: { origin: "log_data", category: input.category },
      metadata: (input.metadata as Record<string, unknown>) || {},
      expires_at: null,
    });
    return JSON.stringify({ success: true, id: memory.id, category: input.category });
  },
};

export const getData: ToolDefinition = {
  name: "get_data",
  description: "Retrieve logged data by category. Returns recent entries.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Data category to retrieve" },
      limit: { type: "number", description: "Max results (default 20)" },
    },
    required: ["category"],
  },
  tier: "pack",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const { searchMemoryKeyword } = await import("@exoskull/store");
    const results = await searchMemoryKeyword(tenantId, `[${input.category}]`, (input.limit as number) || 20);

    if (results.length === 0) return `No data logged for "${input.category}".`;

    return results
      .map((r) => `${r.created_at.split("T")[0]}: ${r.content}`)
      .join("\n");
  },
};

export const ADMIN_TOOLS: ToolDefinition[] = [
  requestAutonomy,
  listIntegrations,
  discoverTools,
  planAction,
  logData,
  getData,
];
