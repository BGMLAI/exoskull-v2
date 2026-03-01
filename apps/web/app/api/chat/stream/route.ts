import { NextRequest } from "next/server";
import { createSSEStream } from "@exoskull/engine/gateway";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { getOrCreateTenant } from "@exoskull/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Parse body
    const body = await req.json();
    const { message, sessionId } = body;

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message required" }), { status: 400 });
    }

    // Get or create tenant
    const tenant = await getOrCreateTenant(user.id, user.email);

    // Create SSE stream
    const stream = createSSEStream({
      tenantId: tenant.id,
      sessionId: sessionId || crypto.randomUUID(),
      userMessage: message,
      channel: "web_chat",
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[chat/stream] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
}
