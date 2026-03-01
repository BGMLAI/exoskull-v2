// Type declarations for optional runtime dependencies
declare module "@tavily/core" {
  export function tavily(opts: { apiKey: string }): {
    search(query: string, opts?: { maxResults?: number }): Promise<{
      results: Array<{ title: string; url: string; content: string }>;
    }>;
  };
}
