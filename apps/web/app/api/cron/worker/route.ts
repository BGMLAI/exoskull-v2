import { NextRequest } from "next/server";
import { processQueue } from "@exoskull/engine/heartbeat";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startMs = Date.now();
  const processed = await processQueue(5, 50_000);

  return Response.json({
    processed,
    durationMs: Date.now() - startMs,
  });
}
