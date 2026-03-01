"use client";

import { useChatEngine } from "@exoskull/engine";
import { ChatShell } from "@exoskull/ui";
import { useSpatialStore } from "@exoskull/store";
import { useEffect, useCallback } from "react";

/**
 * Main app page — Claude Code wrapper interface.
 *
 * Layout: Split view
 * - Left: Chat (primary — Claude Code conversations)
 * - Right: Code panel (diffs, file viewer, terminal) — togglable
 *
 * This is the "body" of the digital organism.
 * Claude Code is the nervous system underneath.
 */
export default function AppPage() {
  const engine = useChatEngine("/api/chat/stream");
  const { commandPaletteOpen, setCommandPaletteOpen, codePanelOpen, setCodePanelOpen } =
    useSpatialStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      // Ctrl+B toggle code panel
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCodePanelOpen(!codePanelOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, codePanelOpen, setCommandPaletteOpen, setCodePanelOpen]);

  return (
    <div
      className="h-dvh w-full overflow-hidden bg-background flex"
      onDragOver={engine.handleDragOver}
      onDragLeave={engine.handleDragLeave}
      onDrop={engine.handleDrop}
    >
      {/* Drag overlay */}
      {engine.isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <p className="text-lg font-medium text-primary">Upusc pliki tutaj</p>
        </div>
      )}

      {/* Main chat panel */}
      <div className={codePanelOpen ? "w-1/2 border-r border-border" : "w-full"}>
        <div className="h-full flex flex-col">
          {/* Top bar */}
          <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold tracking-tight">ExoSkull</h1>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
                v2
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCodePanelOpen(!codePanelOpen)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                title="Toggle code panel (Ctrl+B)"
              >
                {codePanelOpen ? "Hide code" : "Show code"}
              </button>
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                title="Command palette (Ctrl+K)"
              >
                Ctrl+K
              </button>
            </div>
          </header>

          {/* Chat */}
          <ChatShell engine={engine} className="flex-1 min-h-0" />
        </div>
      </div>

      {/* Code panel (right side) */}
      {codePanelOpen && (
        <div className="w-1/2 flex flex-col bg-card">
          <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">Code</span>
            <button
              onClick={() => setCodePanelOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              x
            </button>
          </header>
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <p>Zacznij rozmowe — diffy i pliki pojawia sie tutaj.</p>
          </div>
        </div>
      )}
    </div>
  );
}
