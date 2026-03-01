/**
 * Embedding generation for memory vector search.
 * Uses OpenAI text-embedding-3-small (1536 dims).
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // trim to avoid token limits
      dimensions: EMBEDDING_DIMS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error: ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Try to embed, return null on failure (graceful degradation).
 */
export async function tryEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch {
    return null;
  }
}
