/**
 * App Builder Tools — BMAD pipeline for building full-stack apps.
 *
 * Flow: create_app_spec → scaffold_app → write_code → run_tests → deploy_app
 *
 * Uses VPS executor (Docker sandbox) for safe code execution.
 * Apps are built when goals require them — triggered by user or heartbeat.
 */

import type { ToolDefinition } from "@exoskull/types";
import Anthropic from "@anthropic-ai/sdk";
import { insertBlob, registerTool } from "@exoskull/store";

const MODEL = "claude-sonnet-4-6";
const VPS_URL = process.env.VPS_EXECUTOR_URL || "http://57.128.253.15:3500";
const VPS_SECRET = process.env.VPS_EXECUTOR_SECRET;

// ── VPS Executor Client ─────────────────────────────────────────────────

async function executeOnVPS(payload: {
  code: string;
  language?: string;
  timeout?: number;
  install_deps?: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!VPS_SECRET) throw new Error("VPS_EXECUTOR_SECRET not set");

  const response = await fetch(`${VPS_URL}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VPS_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`VPS execution failed: ${err}`);
  }

  return response.json();
}

// ── App Spec Generator ──────────────────────────────────────────────────

export const createAppSpec: ToolDefinition = {
  name: "create_app_spec",
  description: "Generate a PRD and architecture spec for a new app. AI creates requirements, tech stack, DB schema, API design, and component tree.",
  input_schema: {
    type: "object",
    properties: {
      description: { type: "string", description: "What the app should do" },
      constraints: { type: "string", description: "Tech constraints or preferences" },
      goal_id: { type: "string", description: "Related goal ID (optional)" },
    },
    required: ["description"],
  },
  tier: "pack",
  timeoutMs: 60_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: `You are an expert software architect. Generate a complete app specification as JSON.
Include: name, description, tech_stack, db_schema (tables with columns), api_routes (method, path, description), components (name, purpose, props), pages (route, components).
Stack: Next.js 15 + Supabase + Tailwind CSS. Keep it minimal but functional.`,
      messages: [
        {
          role: "user",
          content: `Build an app: ${input.description}${input.constraints ? `\nConstraints: ${input.constraints}` : ""}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return text;
  },
};

// ── Scaffold App ─────────────────────────────────────────────────────────

export const scaffoldApp: ToolDefinition = {
  name: "scaffold_app",
  description: "Create project structure on VPS sandbox based on an app spec.",
  input_schema: {
    type: "object",
    properties: {
      app_name: { type: "string", description: "App name (kebab-case)" },
      spec: { type: "string", description: "App spec JSON from create_app_spec" },
    },
    required: ["app_name", "spec"],
  },
  tier: "pack",
  timeoutMs: 120_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    const appName = input.app_name as string;

    const scaffoldCode = `
const fs = require('fs');
const path = require('path');

const spec = ${JSON.stringify(input.spec)};
const appDir = '/app/${appName}';

// Create directory structure
const dirs = ['app', 'app/api', 'components', 'lib', 'public'];
dirs.forEach(d => fs.mkdirSync(path.join(appDir, d), { recursive: true }));

// Create package.json
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: '${appName}',
  version: '0.1.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
  },
  dependencies: {
    next: '^15.0.0',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
    '@supabase/supabase-js': '^2.49.0',
  },
  devDependencies: {
    typescript: '^5.0.0',
    '@types/react': '^19.0.0',
    tailwindcss: '^4.0.0',
  },
}, null, 2));

// Create basic files
fs.writeFileSync(path.join(appDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    lib: ['dom', 'dom.iterable', 'esnext'],
    jsx: 'preserve',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    esModuleInterop: true,
    paths: { '@/*': ['./*'] },
  },
  include: ['**/*.ts', '**/*.tsx'],
}, null, 2));

console.log(JSON.stringify({ success: true, path: appDir, files: dirs.length + 2 }));
`;

    const result = await executeOnVPS({
      code: scaffoldCode,
      language: "javascript",
      timeout: 60,
      install_deps: [],
    });

    if (result.exitCode !== 0) {
      return `Scaffold failed: ${result.stderr}`;
    }

    return result.stdout;
  },
};

// ── Write Code ───────────────────────────────────────────────────────────

export const writeCode: ToolDefinition = {
  name: "write_code",
  description: "Write or update a specific file in an app on VPS. AI generates code guided by the app spec.",
  input_schema: {
    type: "object",
    properties: {
      app_name: { type: "string", description: "App name" },
      file_path: { type: "string", description: "File path relative to app root" },
      spec_context: { type: "string", description: "Relevant part of the app spec" },
      instructions: { type: "string", description: "What this file should do" },
    },
    required: ["app_name", "file_path", "instructions"],
  },
  tier: "pack",
  timeoutMs: 60_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: `You are an expert developer. Write the complete file content. Output ONLY the code, no markdown fences or explanations.
Tech stack: Next.js 15 + TypeScript + Supabase + Tailwind CSS.`,
      messages: [
        {
          role: "user",
          content: `File: ${input.file_path}\nSpec: ${input.spec_context || "N/A"}\nInstructions: ${input.instructions}`,
        },
      ],
    });

    const code = response.content[0].type === "text" ? response.content[0].text : "";

    // Write to VPS
    const writeScript = `
const fs = require('fs');
const path = require('path');
const filePath = path.join('/app/${input.app_name}', ${JSON.stringify(input.file_path)});
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, ${JSON.stringify(code)});
console.log(JSON.stringify({ success: true, path: filePath, bytes: ${JSON.stringify(code)}.length }));
`;

    const result = await executeOnVPS({ code: writeScript, language: "javascript" });

    if (result.exitCode !== 0) {
      return `Write failed: ${result.stderr}`;
    }

    return result.stdout;
  },
};

// ── Run Tests ────────────────────────────────────────────────────────────

export const runTests: ToolDefinition = {
  name: "run_tests",
  description: "Run tests for an app on VPS sandbox. Installs deps and builds first.",
  input_schema: {
    type: "object",
    properties: {
      app_name: { type: "string", description: "App name" },
      command: { type: "string", description: "Test command (default: npm run build)" },
    },
    required: ["app_name"],
  },
  tier: "pack",
  timeoutMs: 180_000,
  async execute(input: Record<string, unknown>): Promise<string> {
    const command = (input.command as string) || "npm run build";

    const testScript = `
const { execSync } = require('child_process');
const appDir = '/app/${input.app_name}';

try {
  console.log('Installing dependencies...');
  execSync('npm install', { cwd: appDir, timeout: 60000, stdio: 'pipe' });

  console.log('Running: ${command}');
  const output = execSync('${command}', { cwd: appDir, timeout: 120000, stdio: 'pipe' });
  console.log(JSON.stringify({ success: true, output: output.toString().slice(-2000) }));
} catch (err) {
  console.log(JSON.stringify({ success: false, error: err.stderr?.toString().slice(-2000) || err.message }));
}
`;

    const result = await executeOnVPS({
      code: testScript,
      language: "javascript",
      timeout: 180,
    });

    return result.stdout || result.stderr;
  },
};

// ── Deploy App ───────────────────────────────────────────────────────────

export const deployApp: ToolDefinition = {
  name: "deploy_app",
  description: "Deploy a built app. Currently supports VPS static hosting.",
  input_schema: {
    type: "object",
    properties: {
      app_name: { type: "string", description: "App name" },
      deploy_target: { type: "string", description: "Target: vps (default)" },
    },
    required: ["app_name"],
  },
  tier: "pack",
  timeoutMs: 120_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    // For now, just report the app is ready on VPS
    // Future: Vercel deployment via API
    const appName = input.app_name as string;

    const result = await executeOnVPS({
      code: `
const { execSync } = require('child_process');
const fs = require('fs');
const appDir = '/app/${appName}';

if (!fs.existsSync(appDir)) {
  console.log(JSON.stringify({ success: false, error: 'App not found' }));
  process.exit(0);
}

try {
  execSync('npm run build', { cwd: appDir, timeout: 120000, stdio: 'pipe' });
  console.log(JSON.stringify({ success: true, url: 'http://57.128.253.15:3001/${appName}', app: '${appName}' }));
} catch (err) {
  console.log(JSON.stringify({ success: false, error: err.message }));
}
`,
      language: "javascript",
      timeout: 120,
    });

    // Store blob metadata
    await insertBlob({
      tenant_id: tenantId,
      kind: "export",
      filename: `${appName}.tar.gz`,
      mime_type: "application/gzip",
      size_bytes: null,
      storage_path: `apps/${tenantId}/${appName}`,
      processing_status: "completed",
      extracted_text: null,
      metadata: { app_name: appName, deployed: true },
    });

    return result.stdout || result.stderr;
  },
};

// ── Self-Extend Tool ─────────────────────────────────────────────────────

export const buildTool: ToolDefinition = {
  name: "build_tool",
  description: "Generate a new tool when you need a capability you don't have. Creates the tool definition, tests it in sandbox, and registers it for future use.",
  input_schema: {
    type: "object",
    properties: {
      capability: { type: "string", description: "What capability is needed" },
      name: { type: "string", description: "Tool name (snake_case)" },
      description: { type: "string", description: "Tool description" },
    },
    required: ["capability", "name"],
  },
  tier: "pack",
  timeoutMs: 60_000,
  async execute(input: Record<string, unknown>, tenantId: string): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Generate tool handler code
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: `You generate tool handler code for ExoSkull. Output a JSON object with:
{
  "name": "tool_name",
  "description": "What it does",
  "input_schema": { "type": "object", "properties": {...}, "required": [...] },
  "handler_code": "async function execute(input, tenantId) { ... return JSON.stringify(result); }",
  "test_code": "Code to verify the tool works"
}
The handler must be a self-contained async function. Use fetch for HTTP calls. No external deps.`,
      messages: [
        {
          role: "user",
          content: `Build a tool for: ${input.capability}\nName: ${input.name}\nDescription: ${input.description || input.capability}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return "Failed to generate tool spec.";
      const spec = JSON.parse(jsonMatch[0]);

      // Test in VPS sandbox
      if (spec.test_code) {
        const testResult = await executeOnVPS({
          code: spec.test_code,
          language: "javascript",
          timeout: 30,
        });

        if (testResult.exitCode !== 0) {
          return JSON.stringify({
            success: false,
            error: "Tool test failed",
            stderr: testResult.stderr.slice(0, 500),
          });
        }
      }

      // Register in tools table
      await registerTool({
        tenant_id: tenantId,
        slug: spec.name || (input.name as string),
        name: spec.name || (input.name as string),
        description: spec.description || (input.description as string),
        kind: "tool",
        schema: spec.input_schema || { type: "object" as const, properties: {} },
        handler: `dynamic:${spec.name}`,
        config: { handler_code: spec.handler_code },
        enabled: true,
      });

      return JSON.stringify({
        success: true,
        tool: spec.name,
        message: `Tool "${spec.name}" created and registered. Available for future requests.`,
      });
    } catch (err) {
      return `Tool generation failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── Export ────────────────────────────────────────────────────────────────

export const APPS_TOOLS: ToolDefinition[] = [
  createAppSpec,
  scaffoldApp,
  writeCode,
  runTests,
  deployApp,
  buildTool,
];
