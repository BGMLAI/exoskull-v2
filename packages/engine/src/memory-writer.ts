/**
 * MEMORY.md Writer — compresses recent events into rolling working memory.
 *
 * MEMORY.md is the "short-term memory" layer:
 * - Today's events summary
 * - Yesterday's summary
 * - This week's headlines
 * - Lessons learned
 * - Pending items
 *
 * Updated every 15min by heartbeat. Stored in `memory` (kind='working_memory').
 *
 * Impact: agent knows what happened recently without loading raw events.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Event } from "@exoskull/types";
import {
  getRecentEvents,
  getWorkingMemory,
  insertMemory,
  updateMemory,
  getTasks,
} from "@exoskull/store";

export async function updateWorkingMemory(tenantId: string): Promise<string> {
  // Load recent events (last 200) and active tasks in parallel
  const [recentEvents, activeTasks] = await Promise.all([
    getRecentEvents(tenantId, 200),
    getTasks(tenantId, "active"),
  ]);

  if (recentEvents.length === 0 && activeTasks.length === 0) {
    return "No recent activity.";
  }

  // Group events by day
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400_000).toISOString().split("T")[0];

  const todayEvents = recentEvents.filter((e) => e.created_at.startsWith(today));
  const yesterdayEvents = recentEvents.filter((e) => e.created_at.startsWith(yesterday));
  const olderEvents = recentEvents.filter(
    (e) => !e.created_at.startsWith(today) && !e.created_at.startsWith(yesterday),
  );

  // Summarize with AI
  const rawData = [
    `Today (${today}): ${summarizeEvents(todayEvents)}`,
    `Yesterday (${yesterday}): ${summarizeEvents(yesterdayEvents)}`,
    `Older: ${summarizeEvents(olderEvents.slice(0, 50))}`,
    `Active tasks (${activeTasks.length}): ${activeTasks.map((t) => `- ${t.title} (P${t.priority})`).join("\n")}`,
  ].join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: `You create MEMORY.md — a concise working memory for an AI assistant.
Format:
# MEMORY.md
## Today
(bullet points of today's key events)
## Yesterday
(bullet points)
## This Week
(high-level headlines)
## Pending
(tasks that need attention)
## Lessons
(any patterns or insights from recent interactions)

Be concise. Max 40 lines. Write in the same language as the events.`,
    messages: [
      { role: "user", content: `Build MEMORY.md from:\n\n${rawData}` },
    ],
  });

  const memory = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  // Persist
  const existing = await getWorkingMemory(tenantId);
  if (existing) {
    await updateMemory(existing.id, {
      content: memory,
      metadata: { updated_at: new Date().toISOString(), event_count: recentEvents.length },
    });
  } else {
    await insertMemory({
      tenant_id: tenantId,
      kind: "working_memory",
      content: memory,
      embedding: null,
      importance: 0.9,
      source: { origin: "memory_writer" },
      metadata: { event_count: recentEvents.length },
      expires_at: null,
    });
  }

  return memory;
}

function summarizeEvents(events: Event[]): string {
  if (events.length === 0) return "No activity.";

  const byKind: Record<string, number> = {};
  const toolNames: string[] = [];
  const messages: string[] = [];

  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;

    if (e.kind === "user_msg" && typeof e.data.content === "string") {
      messages.push(`User: ${e.data.content.slice(0, 100)}`);
    } else if (e.kind === "assistant_msg" && typeof e.data.content === "string") {
      messages.push(`Assistant: ${e.data.content.slice(0, 100)}`);
    } else if (e.kind === "tool_call" && typeof e.data.tool === "string") {
      if (!toolNames.includes(e.data.tool)) toolNames.push(e.data.tool);
    }
  }

  const parts = [
    `${events.length} events`,
    Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join(", "),
  ];

  if (toolNames.length > 0) parts.push(`Tools used: ${toolNames.join(", ")}`);
  if (messages.length > 0) parts.push(`Conversations:\n${messages.slice(0, 10).join("\n")}`);

  return parts.join("\n");
}
