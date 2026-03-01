/**
 * ExoSkull v2 Agent — ReAct loop with event sourcing.
 *
 * Flow: User Message → Context Assembly → ReAct Loop → Post-Process → Stream Response
 *
 * Cherry-picked from v1: tool loop, streaming, timeout, error escalation.
 * New in v2: event sourcing, SOUL/MEMORY context, three-tier tools.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentRequest,
  AgentResponse,
  AgentConfig,
  ToolDefinition,
  EventInsert,
} from "@exoskull/types";
import { buildContext } from "./context-builder";
import { EventStore } from "./event-store";
import { getAllTools } from "./tools";
import { MAX_TOOL_RESULT_LENGTH } from "./tools/types";
import { analyzeEmotion, detectCrisis } from "./emotion";
import { runReflexion } from "./reflexion";
import { guardResponse, fallbackResponse } from "./resilience";

// ── Configuration ───────────────────────────────────────────────────────────
// Subscription-based pricing: no per-token cost optimization needed.
// Use Sonnet everywhere. Be thorough — more turns = better results.

const MODEL = "claude-sonnet-4-6";

const CONFIGS: Record<string, AgentConfig> = {
  web_chat:    { maxTurns: 25, timeoutMs: 120_000, model: MODEL },
  voice:       { maxTurns: 10, timeoutMs: 60_000,  model: MODEL },
  sms:         { maxTurns: 10, timeoutMs: 45_000,  model: MODEL },
  telegram:    { maxTurns: 20, timeoutMs: 90_000,  model: MODEL },
  autonomous:  { maxTurns: 20, timeoutMs: 120_000, model: MODEL },
  default:     { maxTurns: 20, timeoutMs: 90_000,  model: MODEL },
};

function getConfig(channel: string, mode?: string): AgentConfig {
  if (mode === "autonomous") return CONFIGS.autonomous;
  return CONFIGS[channel] ?? CONFIGS.default;
}

// ── Anthropic Helpers ───────────────────────────────────────────────────────

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool["input_schema"],
  }));
}

async function executeTool(
  tools: ToolDefinition[],
  name: string,
  input: Record<string, unknown>,
  tenantId: string,
): Promise<{ result: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { result: `Tool not found: ${name}`, isError: true };

  const timeout = tool.timeoutMs ?? 10_000;

  try {
    let result = await Promise.race([
      tool.execute(input, tenantId),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${name} timed out after ${timeout}ms`)), timeout),
      ),
    ]);

    if (result.length > MAX_TOOL_RESULT_LENGTH) {
      result = result.slice(0, MAX_TOOL_RESULT_LENGTH) + `\n[Truncated — ${result.length} chars]`;
    }

    return { result, isError: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] Tool ${name} failed:`, msg);
    return { result: `Error: ${msg}`, isError: true };
  }
}

// ── Main Agent Function ─────────────────────────────────────────────────────

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const startMs = Date.now();
  const config = getConfig(req.channel, req.mode);
  const tools = getAllTools();

  // Phase 0: Emotion + crisis check
  const emotion = analyzeEmotion(req.userMessage);
  const crisis = detectCrisis(req.userMessage);

  // Phase 1: Context assembly
  const { systemPrompt: basePrompt, threadMessages, tenant } = await buildContext(
    req.tenantId,
    req.sessionId,
    req.channel,
  );

  // Inject emotion context into system prompt
  let systemPrompt = basePrompt;
  if (crisis.isCrisis) {
    systemPrompt += `\n\n## CRISIS DETECTED: ${crisis.type}\nPrioritize user safety. Provide crisis resources. Do NOT use tools except for emergency contacts.`;
  } else if (emotion.quadrant !== "Q4") {
    systemPrompt += `\n\n## Emotional Context\nUser mood: ${emotion.label} (${emotion.quadrant}). ${emotion.toneGuide}`;
  }

  // Phase 2: Event store
  const eventStore = new EventStore(req.tenantId, req.sessionId, req.channel);
  await eventStore.init();

  // Log user message event
  if (!req.skipThreadAppend) {
    eventStore.emit("user_msg", { content: req.userMessage, channel: req.channel });
  }

  // Phase 3: ReAct loop
  const abortController = new AbortController();
  const timeout = req.timeoutMs ?? config.timeoutMs;
  const timeoutHandle = setTimeout(() => abortController.abort(), timeout);

  const toolsUsed: string[] = [];
  let finalText = "";
  let totalIn = 0;
  let totalOut = 0;
  let numTurns = 0;
  let totalErrors = 0;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const anthropicTools = toAnthropicTools(tools);

    // Build messages: thread history + current user message
    const messages: Anthropic.MessageParam[] = [
      ...threadMessages,
      ...(req.skipThreadAppend ? [] : [{ role: "user" as const, content: req.userMessage }]),
    ];

    // Ensure thread ends with user message
    if (messages.length > 0 && messages[messages.length - 1].role !== "user") {
      messages.push({ role: "user", content: req.userMessage });
    }

    while (numTurns < config.maxTurns) {
      numTurns++;

      const stream = client.messages.stream(
        {
          model: config.model,
          max_tokens: req.maxTokens ?? 4096,
          system: systemPrompt,
          messages,
          tools: anthropicTools,
        },
        { signal: abortController.signal },
      );

      // Stream text deltas to caller
      if (req.onTextDelta) {
        stream.on("text", (text) => req.onTextDelta!(text));
      }

      const response = await stream.finalMessage();
      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;

      // Separate text and tool blocks
      const textParts: string[] = [];
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") textParts.push(block.text);
        else if (block.type === "tool_use") toolUseBlocks.push(block);
      }

      // No tool calls → done
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        finalText = textParts.join("");
        break;
      }

      // Tool use → execute all in parallel
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const toolName = toolUse.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);

          req.onToolStart?.(toolName);
          const toolStartMs = Date.now();

          // Emit tool_call event
          eventStore.emit("tool_call", { tool: toolName, input: toolUse.input });

          const { result, isError } = await executeTool(
            tools,
            toolName,
            toolUse.input as Record<string, unknown>,
            req.tenantId,
          );

          if (isError) totalErrors++;

          const durationMs = Date.now() - toolStartMs;

          // Emit tool_result event
          eventStore.emit("tool_result", {
            tool: toolName,
            success: !isError,
            duration_ms: durationMs,
            result_preview: result.slice(0, 200),
          });

          req.onToolEnd?.(toolName, durationMs, {
            success: !isError,
            resultSummary: result.slice(0, 200),
          });

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
            ...(isError ? { is_error: true as const } : {}),
          };
        }),
      );

      // Stop after 5 tool errors
      if (totalErrors >= 5) {
        finalText = "Too many tool errors. Please try again.";
        eventStore.emit("error", { reason: "tool_error_limit", count: totalErrors });
        break;
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText && numTurns >= config.maxTurns) {
      finalText = "Reached turn limit. Please try a simpler request.";
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (abortController.signal.aborted) {
      finalText = finalText || "Request timed out.";
    } else {
      console.error("[Agent] API error:", errMsg);
      // Emergency fallback: use Gemini Flash if Claude fails
      finalText = await fallbackResponse(req.userMessage, systemPrompt);
    }
    eventStore.emit("error", { error: errMsg });
  } finally {
    clearTimeout(timeoutHandle);
  }

  // Phase 4: Post-process (cost tracking is informational — subscription-based)
  const costCents = (totalIn * 0.3 + totalOut * 1.5) / 100_000;
  const costUsd = costCents / 100;

  eventStore.emit("assistant_msg", { content: finalText }, {
    in: totalIn,
    out: totalOut,
    costCents,
  });

  // Flush all events to DB
  await eventStore.flush().catch((err) => {
    console.error("[Agent] Failed to flush events:", err);
  });

  const durationMs = Date.now() - startMs;

  let response: AgentResponse = {
    text: finalText,
    toolsUsed,
    events: eventStore.getBuffer(),
    costUsd,
    numTurns,
    durationMs,
  };

  // Phase 5: Anti-hallucination guard
  response = guardResponse(response);

  // Phase 6: Reflexion (async, non-blocking — subscription = no cost concern)
  runReflexion(req.tenantId, req.userMessage, response).catch((err) => {
    console.error("[Agent] Reflexion failed (non-blocking):", err);
  });

  return response;
}
