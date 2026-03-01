import { NextRequest } from "next/server";
import { parseTelegramUpdate, sendTelegramMessage } from "@exoskull/engine/gateway/adapters/telegram";
import { routeMessage } from "@exoskull/engine/gateway";
import { runAgent } from "@exoskull/engine/agent";
import { withLane } from "@exoskull/engine/lane-queue";
import type { TelegramUpdate } from "@exoskull/engine/gateway/adapters/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Verify webhook secret (optional, set via Telegram setWebhook secret_token)
  const secretToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update: TelegramUpdate = await req.json();

  const inbound = await parseTelegramUpdate(update);
  if (!inbound) {
    return Response.json({ ok: true, skipped: true });
  }

  const chatId = update.message!.chat.id;

  // Process serially per tenant
  try {
    await withLane(inbound.tenantId, async () => {
      const agentReq = routeMessage(inbound);
      const response = await runAgent(agentReq);

      if (response.text) {
        await sendTelegramMessage(chatId, response.text);
      }
    });
  } catch (err) {
    console.error("[Telegram] Error processing update:", err);
    await sendTelegramMessage(chatId, "Sorry, I encountered an error. Please try again.").catch(() => {});
  }

  return Response.json({ ok: true });
}
