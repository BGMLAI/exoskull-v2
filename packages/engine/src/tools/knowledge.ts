/**
 * Knowledge Tools — RAG, web search, document management.
 */

import type { ToolDefinition } from "@exoskull/types";
import { searchMemoryKeyword, insertMemory, insertBlob } from "@exoskull/store";

export const searchWeb: ToolDefinition = {
  name: "search_web",
  description: "Search the web for information. Use this when you need current data, facts, or research.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  tier: "pack",
  timeoutMs: 15_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    // Tavily search (if available)
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "Web search not configured (TAVILY_API_KEY missing).";

    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey });
      const result = await client.search(input.query as string, { maxResults: 5 });
      return result.results
        .map((r: { title: string; url: string; content: string }, i: number) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content?.slice(0, 300)}`)
        .join("\n\n");
    } catch (err) {
      return `Web search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const importUrl: ToolDefinition = {
  name: "import_url",
  description: "Import a web page into the knowledge base. Fetches, extracts text, stores as memory.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to import" },
      title: { type: "string", description: "Optional title" },
    },
    required: ["url"],
  },
  tier: "pack",
  timeoutMs: 30_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    try {
      const response = await fetch(input.url as string);
      const html = await response.text();
      // Basic text extraction (strip HTML tags)
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10_000);

      await insertMemory({
        tenant_id: tenantId,
        kind: "document",
        content: text,
        embedding: null,
        importance: 0.5,
        source: { url: input.url, title: input.title || "Imported page" },
        metadata: { type: "web_import" },
        expires_at: null,
      });

      return JSON.stringify({ success: true, chars: text.length, url: input.url });
    } catch (err) {
      return `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const KNOWLEDGE_TOOLS: ToolDefinition[] = [searchWeb, importUrl];
