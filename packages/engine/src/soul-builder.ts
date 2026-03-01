/**
 * SOUL.md Builder — generates the agent's identity document.
 *
 * SOUL.md is the permanent identity layer:
 * - Who the user is (name, language, personality)
 * - What they care about (values, active goals)
 * - What they've granted (permissions)
 * - Key facts (important memories)
 *
 * Stored in `memory` table (kind='soul'). Rebuilt daily by heartbeat
 * or on significant changes (new goal, profile update).
 *
 * Impact: replaces ~8 parallel DB queries with 1 pre-computed text blob.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tenant, Goal, Memory } from "@exoskull/types";
import {
  getTenant,
  getGoalsByStatus,
  getMemoryByKind,
  insertMemory,
  getSoulMemory,
  updateMemory,
} from "@exoskull/store";

export async function buildSoul(tenantId: string): Promise<string> {
  const [tenant, activeGoals, facts, entities] = await Promise.all([
    getTenant(tenantId),
    getGoalsByStatus(tenantId, "active"),
    getMemoryByKind(tenantId, "fact"),
    getMemoryByKind(tenantId, "entity"),
  ]);

  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  const parts: string[] = [];

  // Identity
  parts.push(`# SOUL.md — ${tenant.name || "User"}`);
  parts.push(`Generated: ${new Date().toISOString().split("T")[0]}`);
  parts.push("");

  // Profile
  parts.push("## Profile");
  if (tenant.name) parts.push(`- Name: ${tenant.name}`);
  if (tenant.email) parts.push(`- Email: ${tenant.email}`);
  if (tenant.phone) parts.push(`- Phone: ${tenant.phone}`);
  parts.push(`- Timezone: ${tenant.timezone}`);
  if (tenant.settings.language) parts.push(`- Language: ${tenant.settings.language}`);
  if (tenant.settings.personality) parts.push(`- Personality: ${tenant.settings.personality}`);
  parts.push("");

  // Active goals
  if (activeGoals.length > 0) {
    parts.push("## Active Goals");
    const depthLabels = ["VALUE", "AREA", "QUEST", "TASK"];
    for (const g of activeGoals.filter((g) => g.depth <= 2)) {
      const label = depthLabels[g.depth] || "GOAL";
      const progress = Math.round(g.progress * 100);
      const strategy = g.strategy?.approach ? ` — Strategy: ${g.strategy.approach}` : "";
      parts.push(`- [${label}] ${g.title} (${progress}%, P${g.priority})${strategy}`);
    }
    parts.push("");
  }

  // Permissions
  const grants = Object.entries(tenant.autonomy_grants)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  if (grants.length > 0) {
    parts.push("## Granted Permissions");
    parts.push(grants.map((g) => `- ${g}`).join("\n"));
    parts.push("");
  }

  // Key facts (top 20 by importance)
  const topFacts = facts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20);
  if (topFacts.length > 0) {
    parts.push("## Key Facts");
    for (const f of topFacts) {
      parts.push(`- ${f.content}`);
    }
    parts.push("");
  }

  // Known entities (people, places, projects)
  const topEntities = entities
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15);
  if (topEntities.length > 0) {
    parts.push("## Known Entities");
    for (const e of topEntities) {
      parts.push(`- ${e.content}`);
    }
    parts.push("");
  }

  // Channel IDs
  const channels = Object.entries(tenant.channel_ids).filter(([, v]) => v);
  if (channels.length > 0) {
    parts.push("## Connected Channels");
    parts.push(channels.map(([k, v]) => `- ${k}: ${v}`).join("\n"));
    parts.push("");
  }

  const soul = parts.join("\n");

  // Persist to memory table
  const existing = await getSoulMemory(tenantId);
  if (existing) {
    await updateMemory(existing.id, { content: soul });
  } else {
    await insertMemory({
      tenant_id: tenantId,
      kind: "soul",
      content: soul,
      embedding: null,
      importance: 1.0,
      source: { origin: "soul_builder" },
      metadata: {},
      expires_at: null,
    });
  }

  return soul;
}

/**
 * DEEP rebuild — uses AI to create a richer SOUL.md by analyzing
 * all available data. Called by daily heartbeat.
 */
export async function deepRebuildSoul(tenantId: string): Promise<string> {
  const [tenant, activeGoals, completedGoals, facts, reflections] = await Promise.all([
    getTenant(tenantId),
    getGoalsByStatus(tenantId, "active"),
    getGoalsByStatus(tenantId, "completed"),
    getMemoryByKind(tenantId, "fact"),
    getMemoryByKind(tenantId, "reflection"),
  ]);

  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  const rawContext = [
    `User: ${tenant.name || "Unknown"}, ${tenant.email || "no email"}, tz: ${tenant.timezone}`,
    `Settings: ${JSON.stringify(tenant.settings)}`,
    `Active goals (${activeGoals.length}): ${activeGoals.map((g) => g.title).join(", ")}`,
    `Completed goals (${completedGoals.length}): ${completedGoals.slice(0, 10).map((g) => g.title).join(", ")}`,
    `Key facts (${facts.length}): ${facts.slice(0, 30).map((f) => f.content).join("; ")}`,
    `Reflections (${reflections.length}): ${reflections.slice(0, 10).map((r) => r.content).join("; ")}`,
  ].join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are building a SOUL.md document — the identity layer for an AI assistant.
This document will be injected into every conversation to give the AI context about who the user is.
Write in markdown. Be concise but comprehensive. Include: profile, personality traits observed,
active goals with strategies, key relationships, important facts, patterns noticed.
Write in the user's language (detect from their data).`,
    messages: [
      { role: "user", content: `Build SOUL.md from this data:\n\n${rawContext}` },
    ],
  });

  const soul = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  // Persist
  const existing = await getSoulMemory(tenantId);
  if (existing) {
    await updateMemory(existing.id, { content: soul, metadata: { deep: true, rebuilt_at: new Date().toISOString() } });
  } else {
    await insertMemory({
      tenant_id: tenantId,
      kind: "soul",
      content: soul,
      embedding: null,
      importance: 1.0,
      source: { origin: "soul_builder_deep" },
      metadata: { deep: true },
      expires_at: null,
    });
  }

  return soul;
}
