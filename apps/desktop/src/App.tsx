import { useChatEngine } from "@exoskull/engine";
import { ChatShell } from "@exoskull/ui";

/**
 * Desktop App — Claude Code wrapper via Tauri.
 *
 * In desktop mode, Claude Code runs as a CLI subprocess.
 * The chat engine communicates with it via Tauri IPC commands
 * instead of HTTP API calls.
 *
 * TODO Phase 1:
 * - Tauri IPC bridge for Claude Code subprocess
 * - Local filesystem access via Tauri API
 * - PTY terminal integration
 */
export function App() {
  // TODO: Replace with Tauri IPC-based engine
  const engine = useChatEngine("http://localhost:3000/api/chat/stream");

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <header className="shrink-0 flex items-center px-4 py-2 border-b border-border bg-card/50"
        // Enable Tauri window dragging
        data-tauri-drag-region
      >
        <h1 className="text-sm font-semibold">ExoSkull Desktop</h1>
        <span className="ml-2 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
          v2
        </span>
      </header>

      <ChatShell engine={engine} className="flex-1 min-h-0" />
    </div>
  );
}
