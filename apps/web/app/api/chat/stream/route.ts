import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

/**
 * POST /api/chat/stream — Main chat endpoint.
 * Streams Claude responses via SSE.
 *
 * This is the nervous system — Claude Code API with tool use.
 * Web version uses Anthropic API directly.
 * Desktop version spawns Claude Code CLI subprocess instead.
 */
export async function POST(req: NextRequest) {
  try {
    const { message, threadId } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Message required" }), {
        status: 400,
      });
    }

    // TODO: Add auth check
    // TODO: Add rate limiting
    // TODO: Load conversation history from Supabase
    // TODO: Inject knowledge context (memory/RAG)

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: `You are ExoSkull — a digital organism that wraps Claude Code capabilities.
You help the user with coding, file management, and project work.
You have access to tools for reading/writing files, running bash commands, and git operations.
Respond in the user's language (Polish if they write in Polish).
Be direct and concise.`,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      // TODO: Add tools (read_file, write_file, bash, git, etc.)
    });

    // Convert Anthropic stream to SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            let sseData: string | null = null;

            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if ("text" in delta) {
                sseData = JSON.stringify({
                  type: "delta",
                  data: { text: delta.text },
                });
              }
            } else if (event.type === "message_stop") {
              sseData = JSON.stringify({ type: "done", data: {} });
            }

            if (sseData) {
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          const errData = JSON.stringify({
            type: "error",
            data: { message },
          });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[chat/stream] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}
