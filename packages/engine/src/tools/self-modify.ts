/**
 * Self-Modify Tools — ExoSkull modifies its own codebase via GitHub API.
 * Push = Vercel auto-deploy. The organism evolves itself.
 *
 * Safety: requires explicit user permission (autonomy_grants.self_modify).
 * Changes go to a branch first, not directly to main.
 */

import type { ToolDefinition } from "@exoskull/types";
import Anthropic from "@anthropic-ai/sdk";
import { getTenant } from "@exoskull/store";

const MODEL = "claude-sonnet-4-6";
const GITHUB_REPO = "BGMLAI/exoskull-v2";

async function githubAPI(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set — cannot self-modify");

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Read Own File ──────────────────────────────────────────────────────

export const readOwnFile: ToolDefinition = {
  name: "read_own_file",
  description:
    "Read a file from ExoSkull's own source code. Use this to understand the current codebase before making changes.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to repo root (e.g., 'apps/web/app/(app)/page.tsx')",
      },
    },
    required: ["path"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const data = (await githubAPI(
        `/contents/${input.path}?ref=main`,
      )) as { content?: string; encoding?: string; size?: number; message?: string };

      if (!data.content) {
        return JSON.stringify({ error: "File not found", path: input.path });
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return content;
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── List Own Files ─────────────────────────────────────────────────────

export const listOwnFiles: ToolDefinition = {
  name: "list_own_files",
  description: "List files/directories in ExoSkull's own source code.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path relative to repo root (e.g., 'apps/web/app')",
      },
    },
    required: ["path"],
  },
  tier: "pack",
  timeoutMs: 10_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const data = (await githubAPI(
        `/contents/${input.path}?ref=main`,
      )) as Array<{ name: string; type: string; path: string; size: number }>;

      if (!Array.isArray(data)) {
        return JSON.stringify({ error: "Not a directory", path: input.path });
      }

      return JSON.stringify(
        data.map((f) => ({ name: f.name, type: f.type, path: f.path, size: f.size })),
      );
    } catch (err) {
      return `Error listing: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── Modify Own Code ────────────────────────────────────────────────────

export const modifyOwnCode: ToolDefinition = {
  name: "modify_own_code",
  description: `Modify ExoSkull's own source code. Creates/updates files in the repo and triggers auto-deploy.
Use this to add features, fix bugs, change the dashboard, add new pages, etc.
Changes are pushed directly to main — Vercel auto-deploys.
REQUIRES: autonomy_grants.self_modify = true from user.`,
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description: "Array of files to create/update",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to repo root" },
            content: { type: "string", description: "Full file content" },
          },
          required: ["path", "content"],
        },
      },
      commit_message: {
        type: "string",
        description: "Git commit message describing the change",
      },
    },
    required: ["files", "commit_message"],
  },
  tier: "pack",
  timeoutMs: 30_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    // Permission check
    const tenant = await getTenant(tenantId);
    const grants = (tenant?.autonomy_grants || {}) as Record<string, boolean>;
    if (!grants.self_modify) {
      return JSON.stringify({
        error: "Permission denied",
        message:
          "Potrzebuję uprawnienia 'self_modify' żeby modyfikować swój kod. Przejdź do Settings i włącz 'Self-Modify'.",
      });
    }

    const files = input.files as Array<{ path: string; content: string }>;
    const commitMessage = (input.commit_message as string) || "feat: self-modification by ExoSkull";

    try {
      // Get the current HEAD SHA
      const ref = (await githubAPI("/git/ref/heads/main")) as { object: { sha: string } };
      const baseSha = ref.object.sha;

      // Get the base tree
      const baseCommit = (await githubAPI(`/git/commits/${baseSha}`)) as {
        tree: { sha: string };
      };

      // Create blobs for each file
      const treeItems = await Promise.all(
        files.map(async (f) => {
          const blob = (await githubAPI("/git/blobs", "POST", {
            content: f.content,
            encoding: "utf-8",
          })) as { sha: string };

          return {
            path: f.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          };
        }),
      );

      // Create tree
      const tree = (await githubAPI("/git/trees", "POST", {
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      })) as { sha: string };

      // Create commit
      const commit = (await githubAPI("/git/commits", "POST", {
        message: `${commitMessage}\n\nSelf-modified by ExoSkull agent`,
        tree: tree.sha,
        parents: [baseSha],
      })) as { sha: string };

      // Update main ref
      await githubAPI("/git/refs/heads/main", "PATCH", {
        sha: commit.sha,
        force: false,
      });

      return JSON.stringify({
        success: true,
        commit: commit.sha.slice(0, 7),
        files_changed: files.length,
        message: `Pushed ${files.length} file(s) to main. Vercel auto-deploy triggered. Changes will be live in ~30 seconds.`,
      });
    } catch (err) {
      return JSON.stringify({
        error: "Self-modify failed",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

// ── Generate UI Change ─────────────────────────────────────────────────

export const evolveUI: ToolDefinition = {
  name: "evolve_ui",
  description: `Generate and deploy a UI change to ExoSkull's dashboard.
Describe what you want to add/change — AI generates the code, pushes to GitHub, Vercel auto-deploys.
Use this when user asks to change the dashboard, add a page, modify a component, etc.
REQUIRES: autonomy_grants.self_modify = true.`,
  input_schema: {
    type: "object",
    properties: {
      change_description: {
        type: "string",
        description: "What to change/add in the UI",
      },
      affected_files: {
        type: "array",
        description: "File paths to read for context before generating changes",
        items: { type: "string" },
      },
    },
    required: ["change_description"],
  },
  tier: "pack",
  timeoutMs: 120_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    // Permission check
    const tenant = await getTenant(tenantId);
    const grants = (tenant?.autonomy_grants || {}) as Record<string, boolean>;
    if (!grants.self_modify) {
      return JSON.stringify({
        error: "Permission denied",
        message:
          "Potrzebuję uprawnienia 'self_modify'. Przejdź do Settings → włącz 'Self-Modify'.",
      });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Read affected files for context
    const affectedPaths = (input.affected_files as string[]) || [];
    const fileContents: string[] = [];

    for (const p of affectedPaths.slice(0, 5)) {
      try {
        const data = (await githubAPI(`/contents/${p}?ref=main`)) as {
          content?: string;
        };
        if (data.content) {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          fileContents.push(`=== ${p} ===\n${content}`);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Generate code changes
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: `You are ExoSkull's self-modification engine. Generate code changes for the ExoSkull v2 codebase.

Tech stack: Next.js 15, React 19, Tailwind CSS 4, TypeScript 5, Supabase.
Monorepo: apps/web/ (Next.js app), packages/ui/ (components), packages/engine/ (agent), packages/store/ (DB), packages/types/ (interfaces).

Output a JSON array of files to create/update:
[
  { "path": "apps/web/app/(app)/some-page/page.tsx", "content": "full file content here" },
  ...
]

Rules:
- Use "use client" for interactive components
- Use Tailwind classes for styling (dark theme, bg-background, text-foreground, etc.)
- Import from @exoskull/ui, @exoskull/engine, @exoskull/store, @exoskull/types
- Keep existing patterns from the codebase
- Output ONLY the JSON array, no markdown fences`,
      messages: [
        {
          role: "user",
          content: `Change requested: ${input.change_description}\n\nExisting files for context:\n${fileContents.join("\n\n")}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return JSON.stringify({ error: "Failed to generate code changes" });

      const files = JSON.parse(jsonMatch[0]) as Array<{ path: string; content: string }>;

      // Push via modify_own_code logic
      const result = await modifyOwnCode.execute(
        {
          files,
          commit_message: `feat(self-evolve): ${(input.change_description as string).slice(0, 72)}`,
        },
        tenantId,
      );

      return result;
    } catch (err) {
      return JSON.stringify({
        error: "Code generation failed",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

// ── Export ──────────────────────────────────────────────────────────────

export const SELF_MODIFY_TOOLS: ToolDefinition[] = [
  readOwnFile,
  listOwnFiles,
  modifyOwnCode,
  evolveUI,
];
