/**
 * Resilience — crash recovery, anti-hallucination, emergency fallback.
 *
 * - resumeSession(): replay events from last checkpoint
 * - guardResponse(): block action text without tool calls
 * - fallbackResponse(): Gemini Flash if Claude fails 3x
 */

import { getSessionEvents } from "@exoskull/store";
import type { Event, AgentResponse } from "@exoskull/types";

// ── Crash Recovery ─────────────────────────────────────────────────────

/**
 * Resume a session from the last checkpoint.
 * Replays events to reconstruct agent state.
 */
export async function resumeSession(sessionId: string): Promise<{
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
  toolsUsed: string[];
  eventCount: number;
}> {
  const events = await getSessionEvents(sessionId);

  let lastUserMessage: string | null = null;
  let lastAssistantMessage: string | null = null;
  const toolsUsed: string[] = [];

  for (const event of events) {
    if (event.kind === "user_msg") {
      lastUserMessage = (event.data.content as string) || null;
    } else if (event.kind === "assistant_msg") {
      lastAssistantMessage = (event.data.content as string) || null;
    } else if (event.kind === "tool_call") {
      const tool = event.data.tool as string;
      if (tool && !toolsUsed.includes(tool)) toolsUsed.push(tool);
    }
  }

  return {
    lastUserMessage,
    lastAssistantMessage,
    toolsUsed,
    eventCount: events.length,
  };
}

// ── Anti-Hallucination Guard ──────────────────────────────────────────

/**
 * Patterns that indicate the agent is hallucinating actions
 * instead of using tools.
 */
const ACTION_HALLUCINATION_PATTERNS = [
  /I('ve| have) (sent|called|emailed|messaged|texted|booked|ordered|purchased|paid|transferred)/i,
  /I (just )?(sent|called|emailed|messaged|texted|booked|ordered|purchased|paid|transferred)/i,
  /I('ll| will) (send|call|email|message|text|book|order|purchase|pay|transfer) .* (right now|immediately|now)/i,
  /\[?(sending|calling|emailing|booking|ordering|purchasing|paying)\]?\.{3}/i,
];

/**
 * Check if a response claims to have taken action without using tools.
 * Returns the matched pattern or null.
 */
export function detectHallucination(
  responseText: string,
  toolsUsed: string[],
): string | null {
  // Only flag if NO communication/action tools were used
  const actionTools = [
    "send_sms", "send_email", "make_call",
    "deploy_app", "build_tool",
  ];
  const usedActionTool = toolsUsed.some((t) => actionTools.includes(t));
  if (usedActionTool) return null;

  for (const pattern of ACTION_HALLUCINATION_PATTERNS) {
    const match = responseText.match(pattern);
    if (match) return match[0];
  }

  return null;
}

/**
 * Guard a response against hallucinated actions.
 * Appends a disclaimer if detected.
 */
export function guardResponse(response: AgentResponse): AgentResponse {
  const hallucination = detectHallucination(response.text, response.toolsUsed);

  if (hallucination) {
    console.warn(`[Guard] Hallucination detected: "${hallucination}"`);
    return {
      ...response,
      text: response.text + "\n\n⚠️ *Note: I described an action but didn't actually perform it. Would you like me to use the appropriate tool to do this for real?*",
    };
  }

  return response;
}

// ── Emergency Fallback ──────────────────────────────────────────────────

/**
 * Generate a response using Gemini Flash as emergency fallback.
 * Conversation-only (no tools). Used when Claude fails 3x.
 */
export async function fallbackResponse(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "I'm experiencing technical difficulties. Please try again in a moment.";
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt.slice(0, 4000) }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
    );

    if (!response.ok) {
      return "I'm temporarily unavailable. Please try again shortly.";
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text
      || "I'm having trouble processing your request. Please try again.";
  } catch {
    return "I'm experiencing technical difficulties. Please try again in a moment.";
  }
}
