/**
 * Reflexion — Sweet & Sour self-critique pattern.
 *
 * After agent response: evaluate quality → score → learn from mistakes.
 * With subscription pricing, we run reflexion on EVERY response (not just complex ones).
 *
 * Sweet: what went well → reinforce
 * Sour: what could improve → store episodic memory to avoid repeating
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AgentResponse } from "@exoskull/types";
import { insertMemory } from "@exoskull/store";

export interface ReflexionResult {
  score: number; // 0-100
  sweet: string; // what went well
  sour: string; // what could improve
  shouldRemember: boolean; // store as episodic memory?
}

export async function runReflexion(
  tenantId: string,
  userMessage: string,
  response: AgentResponse,
): Promise<ReflexionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const evaluationPrompt = `Evaluate this agent interaction:

USER: ${userMessage.slice(0, 500)}

AGENT RESPONSE: ${response.text.slice(0, 1000)}

TOOLS USED: ${response.toolsUsed.join(", ") || "none"}
TURNS: ${response.numTurns}

Rate the response quality (0-100) and provide Sweet (what went well) and Sour (what could improve).
Consider: relevance, completeness, action-orientation, goal-alignment, efficiency.

Respond in JSON:
{"score": number, "sweet": "string", "sour": "string"}`;

  try {
    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: evaluationPrompt }],
    });

    const text = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { score: 70, sweet: "Completed", sour: "Could not evaluate", shouldRemember: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { score: number; sweet: string; sour: string };

    const shouldRemember = parsed.score < 50;

    // Store reflection as memory
    if (shouldRemember) {
      await insertMemory({
        tenant_id: tenantId,
        kind: "reflection",
        content: `[Score: ${parsed.score}/100] Sour: ${parsed.sour}. Context: "${userMessage.slice(0, 200)}"`,
        embedding: null,
        importance: Math.max(0.3, (100 - parsed.score) / 100),
        source: { origin: "reflexion", score: parsed.score },
        metadata: { sweet: parsed.sweet, sour: parsed.sour, tools: response.toolsUsed },
        expires_at: null,
      });
    }

    return { ...parsed, shouldRemember };
  } catch (err) {
    console.error("[Reflexion] Failed:", err);
    return { score: 70, sweet: "Unknown", sour: "Reflexion failed", shouldRemember: false };
  }
}
