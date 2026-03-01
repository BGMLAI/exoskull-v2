// ── Message types ──

export type MessageRole = "user" | "assistant" | "system";
export type MessageChannel = "web_chat" | "voice" | "sms" | "telegram" | "desktop";

export interface Message {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  channel: MessageChannel;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  createdAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "done" | "error";
}

export interface Attachment {
  id: string;
  type: "file" | "image" | "code" | "diff";
  name: string;
  content?: string;
  url?: string;
  language?: string;
}

// ── Stream events (SSE) ──

export type StreamEventType =
  | "delta"           // Text chunk
  | "tool_start"      // Tool execution started
  | "tool_end"        // Tool execution finished
  | "code_diff"       // File diff
  | "terminal_output" // Bash/terminal output
  | "file_change"     // File created/modified/deleted
  | "thinking"        // AI thinking step
  | "done"            // Stream complete
  | "error";          // Error

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}

export interface DeltaEvent {
  type: "delta";
  data: { text: string };
}

export interface CodeDiffEvent {
  type: "code_diff";
  data: { file: string; diff: string; language: string };
}

export interface TerminalEvent {
  type: "terminal_output";
  data: { command: string; output: string; exitCode: number };
}

export interface FileChangeEvent {
  type: "file_change";
  data: { path: string; action: "created" | "modified" | "deleted" };
}

// ── Session ──

export interface Session {
  id: string;
  projectPath: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
}

// ── Knowledge ──

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string;
  similarity?: number;
  createdAt: string;
}

// ── Autonomy ──

export type AutonomyStatus = "queued" | "running" | "done" | "failed" | "skipped";

export interface AutonomyTask {
  id: string;
  action: string;
  description: string;
  status: AutonomyStatus;
  result?: string;
  createdAt: string;
  completedAt?: string;
  retries: number;
}
