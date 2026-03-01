import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    if (!audio) {
      return Response.json({ error: "No audio file" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Fallback: use Anthropic to explain we can't transcribe
      return Response.json(
        { error: "Voice transcription not configured (OPENAI_API_KEY missing)" },
        { status: 503 },
      );
    }

    // Call OpenAI Whisper API directly (no SDK needed)
    const whisperForm = new FormData();
    whisperForm.append("file", audio, "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "pl"); // Polish default, Whisper auto-detects anyway

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[voice/transcribe] Whisper error:", err);
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }

    const result = await res.json();
    return Response.json({ text: result.text });
  } catch (err) {
    console.error("[voice/transcribe] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
