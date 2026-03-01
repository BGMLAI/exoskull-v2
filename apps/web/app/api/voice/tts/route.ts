import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") {
      return Response.json({ error: "Text required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "TTS not configured" }, { status: 503 });
    }

    // Trim to 4096 chars (OpenAI TTS limit)
    const trimmedText = text.slice(0, 4096);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: trimmedText,
        voice: voice || "onyx", // onyx = deep, clear male voice
        response_format: "opus", // Small, high quality
        speed: 1.05, // Slightly faster for natural feel
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[voice/tts] OpenAI TTS error:", err);
      return Response.json({ error: "TTS failed" }, { status: 502 });
    }

    // Stream audio back
    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/opus",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[voice/tts] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
