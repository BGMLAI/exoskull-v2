// ============================================================================
// ExoSkull v2 — Shared Type Definitions
// All interfaces for 8 DB tables + engine types
// ============================================================================

// ── DB Row Types ────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  auth_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  timezone: string;
  settings: TenantSettings;
  channel_ids: Record<string, string>;
  autonomy_grants: AutonomyGrants;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  language?: string;
  personality?: string;
  ai_model?: string;
  quiet_hours_start?: number;
  quiet_hours_end?: number;
  preferred_channel?: MessageChannel;
  [key: string]: unknown;
}

export interface AutonomyGrants {
  send_sms?: boolean;
  send_email?: boolean;
  outbound_call?: boolean;
  build_app?: boolean;
  connect_integration?: boolean;
  spend_money?: boolean;
  [key: string]: boolean | undefined;
}

export interface Event {
  id: string;
  tenant_id: string;
  session_id: string | null;
  seq: number;
  kind: EventKind;
  data: Record<string, unknown>;
  channel: MessageChannel;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  created_at: string;
}

export type EventKind =
  | "user_msg"
  | "assistant_msg"
  | "tool_call"
  | "tool_result"
  | "error"
  | "heartbeat"
  | "compaction";

export interface Memory {
  id: string;
  tenant_id: string;
  kind: MemoryKind;
  content: string;
  embedding: number[] | null;
  importance: number;
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;
  accessed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export type MemoryKind =
  | "fact"
  | "episode"
  | "note"
  | "entity"
  | "summary"
  | "reflection"
  | "document"
  | "soul"
  | "working_memory";

export interface Goal {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  depth: GoalDepth;
  title: string;
  description: string | null;
  status: GoalStatus;
  progress: number;
  priority: number;
  strategy: GoalStrategy | null;
  metrics: GoalMetrics | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalDepth = 0 | 1 | 2 | 3;
export type GoalStatus = "active" | "completed" | "paused" | "dropped";

export interface GoalStrategy {
  approach?: string;
  milestones?: string[];
  resources_needed?: string[];
  risks?: string[];
  [key: string]: unknown;
}

export interface GoalMetrics {
  target?: number;
  current?: number;
  unit?: string;
  [key: string]: unknown;
}

export interface Tool {
  id: string;
  tenant_id: string | null;
  slug: string;
  name: string | null;
  description: string | null;
  kind: ToolKind;
  schema: ToolSchema;
  handler: string;
  config: Record<string, unknown>;
  enabled: boolean;
  usage_count: number;
  created_at: string;
}

export type ToolKind = "tool" | "app" | "skill" | "integration";

export interface ToolSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface QueueItem {
  id: string;
  tenant_id: string;
  kind: QueueKind;
  priority: number;
  payload: Record<string, unknown>;
  status: QueueStatus;
  claimed_by: string | null;
  scheduled_for: string;
  recurrence: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
}

export type QueueKind =
  | "heartbeat"
  | "proactive"
  | "etl"
  | "maintenance"
  | "async_task"
  | "scheduled";

export type QueueStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "dead_letter";

export interface Connection {
  id: string;
  tenant_id: string;
  provider: string;
  kind: string;
  credentials: Record<string, unknown>;
  scopes: string[] | null;
  sync_status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export interface Blob {
  id: string;
  tenant_id: string;
  kind: BlobKind;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  processing_status: string;
  extracted_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type BlobKind = "document" | "audio" | "image" | "export";

// ── Insert/Update Types ─────────────────────────────────────────────────────

export type TenantInsert = Partial<Omit<Tenant, "id" | "created_at" | "updated_at">> & { auth_id: string };
export type TenantUpdate = Partial<Omit<Tenant, "id" | "created_at">>;

export type EventInsert = Omit<Event, "id" | "created_at">;

export type MemoryInsert = Omit<Memory, "id" | "created_at" | "accessed_at"> & { accessed_at?: string };
export type MemoryUpdate = Partial<Omit<Memory, "id" | "tenant_id" | "created_at">>;

export type GoalInsert = Omit<Goal, "id" | "created_at" | "updated_at" | "progress"> & { progress?: number };
export type GoalUpdate = Partial<Omit<Goal, "id" | "tenant_id" | "created_at">>;

export type ToolInsert = Omit<Tool, "id" | "created_at" | "usage_count"> & { usage_count?: number };

export type QueueInsert = Omit<QueueItem, "id" | "created_at" | "attempts" | "status"> & { status?: QueueStatus };

export type ConnectionInsert = Omit<Connection, "id" | "created_at">;
export type ConnectionUpdate = Partial<Omit<Connection, "id" | "created_at">>;

export type BlobInsert = Omit<Blob, "id" | "created_at">;
export type BlobUpdate = Partial<Omit<Blob, "id" | "created_at">>;

export type QueueUpdate = Partial<Omit<QueueItem, "id" | "created_at">>;

// ── Engine Types ────────────────────────────────────────────────────────────

export type MessageChannel =
  | "web_chat"
  | "voice"
  | "sms"
  | "telegram"
  | "email"
  | "desktop"
  | "autonomous";

export type AgentMode = "interactive" | "autonomous";

export interface AgentRequest {
  tenantId: string;
  sessionId: string;
  userMessage: string;
  channel: MessageChannel;
  mode?: AgentMode;
  onTextDelta?: (delta: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, durationMs: number, meta?: ToolEndMeta) => void;
  skipThreadAppend?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ToolEndMeta {
  success?: boolean;
  resultSummary?: string;
}

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  events: EventInsert[];
  costUsd?: number;
  numTurns?: number;
  durationMs?: number;
}

export interface AgentConfig {
  maxTurns: number;
  timeoutMs: number;
  model: string;
}

// ── Tool Definition (engine-side) ───────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolSchema;
  execute: (input: Record<string, unknown>, tenantId: string) => Promise<string>;
  tier?: "core" | "pack" | "extended";
  timeoutMs?: number;
}

// ── Memory Search ───────────────────────────────────────────────────────────

export interface MemorySearchResult {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

// ── Stream Events (SSE) ─────────────────────────────────────────────────────

export type StreamEventType =
  | "delta"
  | "tool_start"
  | "tool_end"
  | "code_diff"
  | "terminal_output"
  | "file_change"
  | "thinking"
  | "done"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  data: Record<string, unknown>;
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  tenantId: string;
  channel: MessageChannel;
  startedAt: string;
  lastActiveAt: string;
}

// ── Goal Tree (with children, for client display) ───────────────────────────

export interface GoalNode extends Goal {
  children: GoalNode[];
}

// ── Legacy compat (used by scaffold UI components) ──────────────────────────

export type MessageRole = "user" | "assistant" | "system";

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
