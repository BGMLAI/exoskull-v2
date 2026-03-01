/**
 * Heartbeat — proactive goal monitoring and maintenance.
 *
 * Three tiers:
 * - PULSE  (1min):  Check queue, process pending items. No AI cost.
 * - HEARTBEAT (15min): Per-tenant goal evaluation. Light AI.
 * - DEEP   (24h):  Strategy review, SOUL.md rebuild, cleanup.
 *
 * Central question: "Are user goals making progress?"
 * If not → diagnose why → take action.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  claimItem,
  completeQueueItem,
  failQueueItem,
  enqueue,
  getActiveGoalTree,
  getTasks,
  getRecentEvents,
} from "@exoskull/store";
import type { QueueItem, QueueKind } from "@exoskull/types";
import { updateWorkingMemory } from "./memory-writer";
import { deepRebuildSoul } from "./soul-builder";
import { runAgent } from "./agent";

const MODEL = "claude-sonnet-4-6";

// ── Queue Worker ───────────────────────────────────────────────────────────

/**
 * Process up to `maxItems` queue items within `timeoutMs`.
 * Called by the CRON route every minute.
 */
export async function processQueue(maxItems = 5, timeoutMs = 50_000): Promise<number> {
  const startMs = Date.now();
  let processed = 0;

  while (processed < maxItems && Date.now() - startMs < timeoutMs) {
    const item = await claimItem();
    if (!item) break; // nothing to do

    try {
      await processItem(item);
      await completeQueueItem(item.id);
      processed++;

      // Re-enqueue recurring items
      if (item.recurrence) {
        const nextSchedule = computeNextSchedule(item.recurrence);
        await enqueue({
          tenant_id: item.tenant_id,
          kind: item.kind,
          priority: item.priority,
          payload: item.payload,
          scheduled_for: nextSchedule,
          recurrence: item.recurrence,
          max_attempts: item.max_attempts,
          claimed_by: null,
          last_error: null,
          completed_at: null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Heartbeat] Item ${item.id} failed:`, msg);
      await failQueueItem(item.id, msg);
      processed++;
    }
  }

  return processed;
}

// ── Item Dispatcher ───────────────────────────────────────────────────────

async function processItem(item: QueueItem): Promise<void> {
  switch (item.kind) {
    case "heartbeat":
      await runHeartbeat(item);
      break;
    case "maintenance":
      await runMaintenance(item);
      break;
    case "proactive":
      await runProactive(item);
      break;
    case "async_task":
      await runAsyncTask(item);
      break;
    default:
      console.warn(`[Heartbeat] Unknown queue kind: ${item.kind}`);
  }
}

// ── Heartbeat (15min) ─────────────────────────────────────────────────────

async function runHeartbeat(item: QueueItem): Promise<void> {
  const tenantId = item.tenant_id;

  // 1. Get active goals
  const goals = await getActiveGoalTree(tenantId);
  if (goals.length === 0) return; // nothing to monitor

  // 2. Get recent events (last 15min)
  const events = await getRecentEvents(tenantId, 50);
  const recentActivity = events.map((e) => `[${e.kind}] ${JSON.stringify(e.data).slice(0, 200)}`).join("\n");

  // 3. Get pending tasks
  const tasks = await getTasks(tenantId, "active");
  const taskList = tasks.map((t) => `- [P${t.priority}] ${t.title}`).join("\n");

  // 4. AI evaluation: are goals making progress?
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const goalSummary = goals
    .map((g) => `[${["VALUE", "AREA", "QUEST", "TASK"][g.depth]}] ${g.title} — ${Math.round(g.progress * 100)}% — ${g.status}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are ExoSkull's heartbeat monitor. Your job: check if the user's goals are making progress.
For each goal, evaluate:
1. Is it progressing? (tasks being completed, metrics moving)
2. If stalled: WHY? (no tasks, blocked task, missing data)
3. What ACTION should be taken? (generate tasks, unblock, notify user)

Respond with JSON:
{
  "status": "progressing" | "stalled" | "needs_attention",
  "actions": [{"type": "add_task" | "notify" | "update_memory", "details": "..."}],
  "summary": "Brief progress summary for MEMORY.md"
}`,
    messages: [
      {
        role: "user",
        content: `## Active Goals\n${goalSummary}\n\n## Active Tasks\n${taskList || "No tasks"}\n\n## Recent Activity (last 15min)\n${recentActivity || "No activity"}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse AI response and execute actions
  try {
    const evaluation = JSON.parse(text);

    // Execute recommended actions
    for (const action of evaluation.actions || []) {
      if (action.type === "add_task" && action.details) {
        // Enqueue task creation as an async_task
        await enqueue({
          tenant_id: tenantId,
          kind: "async_task",
          priority: 7,
          payload: { action: "run_agent", message: `System heartbeat: ${action.details}` },
          scheduled_for: new Date().toISOString(),
          recurrence: null,
          max_attempts: 1,
          claimed_by: null,
          last_error: null,
          completed_at: null,
        });
      }
    }

    // Update MEMORY.md with heartbeat summary
    if (evaluation.summary) {
      await updateWorkingMemory(tenantId).catch((err) => {
        console.error("[Heartbeat] MEMORY.md update failed:", err);
      });
    }
  } catch {
    // If AI response isn't valid JSON, just update MEMORY.md
    await updateWorkingMemory(tenantId).catch(() => {});
  }
}

// ── Maintenance (24h) ─────────────────────────────────────────────────────

async function runMaintenance(item: QueueItem): Promise<void> {
  const tenantId = item.tenant_id;
  const task = (item.payload.task as string) || "all";

  if (task === "soul_rebuild" || task === "all") {
    await deepRebuildSoul(tenantId).catch((err) => {
      console.error("[Maintenance] SOUL rebuild failed:", err);
    });
  }

  if (task === "memory_update" || task === "all") {
    await updateWorkingMemory(tenantId).catch((err) => {
      console.error("[Maintenance] MEMORY update failed:", err);
    });
  }

  if (task === "cleanup" || task === "all") {
    const { deleteExpiredMemory, cleanupDeadLetters } = await import("@exoskull/store");
    await deleteExpiredMemory(tenantId);
    await cleanupDeadLetters(7);
  }
}

// ── Proactive Messages ──────────────────────────────────────────────────

async function runProactive(item: QueueItem): Promise<void> {
  const tenantId = item.tenant_id;
  const message = item.payload.message as string;
  if (!message) return;

  // Run agent in autonomous mode to generate and send proactive message
  await runAgent({
    tenantId,
    sessionId: crypto.randomUUID(),
    userMessage: `[SYSTEM PROACTIVE] ${message}`,
    channel: "autonomous",
    mode: "autonomous",
    skipThreadAppend: true,
  });
}

// ── Async Tasks ──────────────────────────────────────────────────────────

async function runAsyncTask(item: QueueItem): Promise<void> {
  const tenantId = item.tenant_id;
  const action = item.payload.action as string;

  if (action === "run_agent") {
    const message = item.payload.message as string;
    if (!message) return;

    await runAgent({
      tenantId,
      sessionId: crypto.randomUUID(),
      userMessage: message,
      channel: "autonomous",
      mode: "autonomous",
      skipThreadAppend: true,
    });
  }
}

// ── Schedule Helpers ────────────────────────────────────────────────────

function computeNextSchedule(recurrence: string): string {
  const now = new Date();

  const match = recurrence.match(/^(\d+)(m|h|d)$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    if (unit === "m") now.setMinutes(now.getMinutes() + value);
    else if (unit === "h") now.setHours(now.getHours() + value);
    else if (unit === "d") now.setDate(now.getDate() + value);
    return now.toISOString();
  }

  // Default: 15 minutes
  now.setMinutes(now.getMinutes() + 15);
  return now.toISOString();
}

// ── Init: Schedule heartbeat for a tenant ───────────────────────────────

export async function initHeartbeat(tenantId: string): Promise<void> {
  // Schedule recurring heartbeat (15min)
  await enqueue({
    tenant_id: tenantId,
    kind: "heartbeat",
    priority: 5,
    payload: { tier: "heartbeat" },
    scheduled_for: new Date().toISOString(),
    recurrence: "15m",
    max_attempts: 3,
    claimed_by: null,
    last_error: null,
    completed_at: null,
  });

  // Schedule daily maintenance
  await enqueue({
    tenant_id: tenantId,
    kind: "maintenance",
    priority: 3,
    payload: { task: "all" },
    scheduled_for: new Date().toISOString(),
    recurrence: "1d",
    max_attempts: 3,
    claimed_by: null,
    last_error: null,
    completed_at: null,
  });
}
