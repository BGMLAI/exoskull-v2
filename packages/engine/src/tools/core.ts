/**
 * Core Tools — Phase 1: Goals + Tasks (6 tools)
 *
 * define_goal, check_goals, log_goal_progress,
 * add_task, list_tasks, complete_task
 */

import type { ToolDefinition, GoalDepth, GoalInsert } from "@exoskull/types";
import {
  insertGoal,
  getActiveGoalTree,
  updateGoalProgress,
  completeGoal,
  getTasks,
  getGoal,
} from "@exoskull/store";

export const defineGoal: ToolDefinition = {
  name: "define_goal",
  description: "Define a new goal, area, quest, or task. Creates the goal and returns it. depth: 0=value, 1=area, 2=quest, 3=task",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Goal title" },
      description: { type: "string", description: "Detailed description" },
      depth: { type: "number", description: "0=value, 1=area, 2=quest, 3=task" },
      parent_id: { type: "string", description: "Parent goal ID (optional)" },
      priority: { type: "number", description: "1-10, higher = more important" },
      strategy: {
        type: "object",
        description: "Strategy object with approach, milestones, resources_needed",
        properties: {
          approach: { type: "string" },
          milestones: { type: "array", items: { type: "string" } },
          resources_needed: { type: "array", items: { type: "string" } },
        },
      },
      due_at: { type: "string", description: "Due date in ISO format" },
    },
    required: ["title"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const goal = await insertGoal({
      tenant_id: tenantId,
      title: input.title as string,
      description: (input.description as string) || null,
      depth: ((input.depth as number) ?? 2) as GoalDepth,
      parent_id: (input.parent_id as string) || null,
      priority: (input.priority as number) ?? 5,
      status: "active",
      strategy: (input.strategy as GoalInsert["strategy"]) ?? null,
      metrics: null,
      due_at: (input.due_at as string) || null,
      completed_at: null,
    });

    return JSON.stringify({ success: true, goal: { id: goal.id, title: goal.title, depth: goal.depth } });
  },
};

export const checkGoals: ToolDefinition = {
  name: "check_goals",
  description: "Get the user's active goal tree with all depths (values → areas → quests → tasks)",
  input_schema: {
    type: "object",
    properties: {},
  },
  tier: "core",
  async execute(_input: Record<string, unknown>, tenantId: string): Promise<string> {
    const tree = await getActiveGoalTree(tenantId);

    if (tree.length === 0) {
      return JSON.stringify({ goals: [], message: "No active goals. Help the user define their first goal." });
    }

    function formatNode(node: { title: string; depth: number; progress: number; priority: number; status: string; children: unknown[] }, indent = 0): string {
      const prefix = "  ".repeat(indent);
      const depth = ["VALUE", "AREA", "QUEST", "TASK"][node.depth] || "GOAL";
      const progress = Math.round(node.progress * 100);
      let line = `${prefix}[${depth}] ${node.title} — ${progress}% — P${node.priority} — ${node.status}`;
      for (const child of node.children as typeof node[]) {
        line += "\n" + formatNode(child, indent + 1);
      }
      return line;
    }

    const formatted = tree.map((n) => formatNode(n)).join("\n\n");
    return formatted;
  },
};

export const logGoalProgress: ToolDefinition = {
  name: "log_goal_progress",
  description: "Update progress on a goal (0.0 to 1.0). Auto-completes at 1.0.",
  input_schema: {
    type: "object",
    properties: {
      goal_id: { type: "string", description: "Goal ID" },
      progress: { type: "number", description: "Progress 0.0 to 1.0" },
    },
    required: ["goal_id", "progress"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>): Promise<string> {
    const goal = await updateGoalProgress(input.goal_id as string, input.progress as number);
    return JSON.stringify({
      success: true,
      goal: { id: goal.id, title: goal.title, progress: goal.progress, status: goal.status },
    });
  },
};

export const addTask: ToolDefinition = {
  name: "add_task",
  description: "Add a task (depth=3) under a quest or area. Tasks are actionable items the user or system can complete.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Task title" },
      description: { type: "string", description: "Task details" },
      parent_id: { type: "string", description: "Parent goal/quest ID" },
      priority: { type: "number", description: "1-10" },
      due_at: { type: "string", description: "Due date ISO" },
    },
    required: ["title"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const task = await insertGoal({
      tenant_id: tenantId,
      title: input.title as string,
      description: (input.description as string) || null,
      depth: 3 as GoalDepth,
      parent_id: (input.parent_id as string) || null,
      priority: (input.priority as number) ?? 5,
      status: "active",
      strategy: null,
      metrics: null,
      due_at: (input.due_at as string) || null,
      completed_at: null,
    });

    return JSON.stringify({ success: true, task: { id: task.id, title: task.title } });
  },
};

export const listTasks: ToolDefinition = {
  name: "list_tasks",
  description: "List all tasks (depth=3). Optionally filter by status.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filter: active | completed | paused | dropped" },
    },
  },
  tier: "core",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const status = input.status as string | undefined;
    const tasks = await getTasks(tenantId, status as "active" | "completed" | "paused" | "dropped" | undefined);

    if (tasks.length === 0) {
      return "No tasks found.";
    }

    const lines = tasks.map((t) => {
      const due = t.due_at ? ` (due: ${t.due_at.split("T")[0]})` : "";
      return `- [${t.status}] ${t.title} — P${t.priority}${due} (id: ${t.id})`;
    });

    return lines.join("\n");
  },
};

export const completeTaskTool: ToolDefinition = {
  name: "complete_task",
  description: "Mark a task as completed.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Task ID to complete" },
    },
    required: ["task_id"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>): Promise<string> {
    const goal = await getGoal(input.task_id as string);
    if (!goal) return JSON.stringify({ error: "Task not found" });

    const completed = await completeGoal(input.task_id as string);
    return JSON.stringify({
      success: true,
      task: { id: completed.id, title: completed.title, status: completed.status },
    });
  },
};

// ── Memory Tools ────────────────────────────────────────────────────────────

export const searchBrain: ToolDefinition = {
  name: "search_brain",
  description: "Search the user's memory/knowledge base. Returns relevant facts, episodes, notes, documents.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const { searchMemoryKeyword } = await import("@exoskull/store");
    const results = await searchMemoryKeyword(tenantId, input.query as string, 10);

    if (results.length === 0) return "No matching memories found.";

    return results
      .map((r, i) => `[${i + 1}] (${r.kind}, importance: ${r.importance}) ${r.content.slice(0, 500)}`)
      .join("\n\n");
  },
};

export const remember: ToolDefinition = {
  name: "remember",
  description: "Store a fact, note, or insight in the user's memory. Persists across sessions.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "What to remember" },
      kind: { type: "string", description: "fact | note | entity | episode" },
      importance: { type: "number", description: "0.0 to 1.0, how important is this" },
    },
    required: ["content"],
  },
  tier: "core",
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const { insertMemory } = await import("@exoskull/store");
    const memory = await insertMemory({
      tenant_id: tenantId,
      kind: (input.kind as "fact" | "note" | "entity" | "episode") || "fact",
      content: input.content as string,
      embedding: null,
      importance: (input.importance as number) ?? 0.5,
      source: { origin: "agent_remember" },
      metadata: {},
      expires_at: null,
    });

    return JSON.stringify({ success: true, memory_id: memory.id });
  },
};

// ── Export all core tools ───────────────────────────────────────────────────

export const CORE_TOOLS: ToolDefinition[] = [
  defineGoal,
  checkGoals,
  logGoalProgress,
  addTask,
  listTasks,
  completeTaskTool,
  searchBrain,
  remember,
];
