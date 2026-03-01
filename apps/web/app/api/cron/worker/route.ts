import { NextRequest } from "next/server";
import { claimItem, completeQueueItem, failQueueItem } from "@exoskull/store";
import { runAgent } from "@exoskull/engine/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify CRON secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startMs = Date.now();
  let processed = 0;
  const errors: string[] = [];

  // Process up to 5 items per invocation (stay within 60s timeout)
  while (processed < 5 && Date.now() - startMs < 50_000) {
    const item = await claimItem();
    if (!item) break;

    try {
      switch (item.kind) {
        case "heartbeat":
          await runAgent({
            tenantId: item.tenant_id,
            sessionId: crypto.randomUUID(),
            userMessage: (item.payload as { prompt?: string }).prompt || "Review active goals and take any needed actions.",
            channel: "autonomous",
            mode: "autonomous",
            maxTokens: 2048,
            timeoutMs: 30_000,
          });
          break;

        case "async_task":
          await runAgent({
            tenantId: item.tenant_id,
            sessionId: crypto.randomUUID(),
            userMessage: (item.payload as { task?: string }).task || "Process pending task.",
            channel: "autonomous",
            mode: "autonomous",
          });
          break;

        default:
          // Other kinds — just complete them for now
          break;
      }

      await completeQueueItem(item.id);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${item.id}: ${msg}`);
      await failQueueItem(item.id, msg);
      processed++;
    }
  }

  return Response.json({
    processed,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startMs,
  });
}
