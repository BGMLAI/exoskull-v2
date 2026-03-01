/**
 * SSE Streaming — converts agent callbacks to Server-Sent Events.
 */

import type { AgentRequest, StreamEvent } from "@exoskull/types";
import { runAgent } from "../agent";

export function createSSEStream(req: AgentRequest): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      function send(event: StreamEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const response = await runAgent({
          ...req,
          onTextDelta(delta) {
            send({ type: "delta", data: { text: delta } });
          },
          onToolStart(name) {
            send({ type: "tool_start", data: { name } });
          },
          onToolEnd(name, durationMs, meta) {
            send({ type: "tool_end", data: { name, durationMs, ...meta } });
          },
        });

        send({
          type: "done",
          data: {
            toolsUsed: response.toolsUsed,
            costUsd: response.costUsd,
            numTurns: response.numTurns,
            durationMs: response.durationMs,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", data: { message } });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}
