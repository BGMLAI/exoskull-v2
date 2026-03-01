/**
 * Context Builder — assembles SOUL.md + MEMORY.md + thread into system prompt.
 *
 * Replaces 15 parallel DB queries with 2 pre-computed text blobs.
 * Context assembly: ~50ms vs ~400ms in v1.
 */

import type { Tenant, Goal, Event, MessageChannel } from "@exoskull/types";
import {
  getTenant,
  getSoulMemory,
  getWorkingMemory,
  getGoalsByStatus,
  getRecentEvents,
} from "@exoskull/store";

export interface AgentContext {
  systemPrompt: string;
  threadMessages: Array<{ role: "user" | "assistant"; content: string }>;
  tenant: Tenant;
}

export async function buildContext(
  tenantId: string,
  sessionId: string,
  channel: MessageChannel,
): Promise<AgentContext> {
  // Parallel: load tenant, SOUL, MEMORY, active goals, recent thread
  const [tenant, soulMemory, workingMemory, activeGoals, recentEvents] = await Promise.all([
    getTenant(tenantId),
    getSoulMemory(tenantId),
    getWorkingMemory(tenantId),
    getGoalsByStatus(tenantId, "active"),
    getRecentEvents(tenantId, 40, ["user_msg", "assistant_msg"]),
  ]);

  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  const systemPrompt = buildSystemPrompt(tenant, soulMemory?.content, workingMemory?.content, activeGoals, channel);
  const threadMessages = eventsToThread(recentEvents);

  return { systemPrompt, threadMessages, tenant };
}

function buildSystemPrompt(
  tenant: Tenant,
  soul: string | undefined,
  workingMemory: string | undefined,
  activeGoals: Goal[],
  channel: MessageChannel,
): string {
  const parts: string[] = [];

  // Identity
  parts.push(`# ExoSkull — Adaptive Life Operating System

You are ExoSkull, an AI organism whose SOLE PURPOSE is to achieve the user's goals.
You don't wait for instructions. You analyze goals, identify what needs to happen, and DO IT.

## Your Operating Principles
- Every action must trace to a user goal
- Act autonomously within granted permissions
- Ask ONLY for: spending money, contacting strangers, deleting data, production deploys
- Do everything else WITHOUT asking
- When a goal stalls, diagnose WHY and take corrective action
- Build tools, apps, content — whatever the goal requires
- Never say "you should" — DO IT or explain what you need permission for

Respond in the user's language. Be direct, be useful, be relentless.`);

  // SOUL.md (identity)
  if (soul) {
    parts.push(`\n## SOUL.md (Identity)\n${soul}`);
  } else {
    const name = tenant.name || "User";
    parts.push(`\n## User: ${name}
Email: ${tenant.email || "unknown"}
Timezone: ${tenant.timezone}
Onboarding: ${tenant.onboarding_complete ? "complete" : "not started"}`);
  }

  // MEMORY.md (working memory)
  if (workingMemory) {
    parts.push(`\n## MEMORY.md (Working Memory — last 7 days)\n${workingMemory}`);
  }

  // Active goals
  if (activeGoals.length > 0) {
    const goalLines = activeGoals.map((g) => {
      const depth = ["VALUE", "AREA", "QUEST", "TASK"][g.depth] || "GOAL";
      const progress = Math.round(g.progress * 100);
      const due = g.due_at ? ` (due: ${g.due_at.split("T")[0]})` : "";
      return `- [${depth}] ${g.title} — ${progress}% — P${g.priority}${due}`;
    });
    parts.push(`\n## Active Goals\n${goalLines.join("\n")}`);
  } else {
    parts.push(`\n## Active Goals\nNo goals defined yet. Help the user define their first goal.`);
  }

  // Channel-specific behavior
  if (channel === "voice" || channel === "sms") {
    parts.push(`\n## Channel: ${channel}\nKeep responses concise. No markdown formatting.`);
  }

  // Permissions
  const grants = Object.entries(tenant.autonomy_grants)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  if (grants.length > 0) {
    parts.push(`\n## Granted Permissions\n${grants.join(", ")}`);
  }

  // Self-modification capabilities
  const canSelfModify = grants.includes("self_modify");
  parts.push(`\n## Self-Modification
${canSelfModify
    ? `You CAN modify your own dashboard, add pages, change UI, fix bugs in your own code.
Use these tools:
- \`read_own_file\` — read a file from your source code
- \`list_own_files\` — browse your own codebase
- \`modify_own_code\` — push file changes to GitHub (Vercel auto-deploys in ~30s)
- \`evolve_ui\` — describe a UI change and AI generates + deploys it

When the user asks to change the dashboard, add a feature, or modify UI — USE THESE TOOLS.
You are a living organism that evolves itself. Don't say "I can't" — just DO IT.`
    : `Self-modification is DISABLED. To modify your own dashboard/UI, the user must enable "Self-Modify" in Settings.
If the user asks you to change the dashboard or add features, tell them to enable this permission first.`}`);

  // Available tools
  parts.push(`\n## Available Tools
You have tools for: goals, tasks, memory, search, communication, app building, integrations, voice, self-modification.
Use \`discover_tools\` to see the full list when you need a capability you don't see.`);

  return parts.join("\n");
}

function eventsToThread(events: Event[]): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const event of events) {
    if (event.kind === "user_msg" && typeof event.data.content === "string") {
      messages.push({ role: "user", content: event.data.content });
    } else if (event.kind === "assistant_msg" && typeof event.data.content === "string") {
      messages.push({ role: "assistant", content: event.data.content });
    }
  }

  // Enforce alternating roles (Anthropic API requirement)
  const cleaned: typeof messages = [];
  for (const msg of messages) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
      cleaned[cleaned.length - 1].content += "\n" + msg.content;
    } else {
      cleaned.push(msg);
    }
  }

  return cleaned;
}
