"use client";

import { useChatEngine } from "@exoskull/engine";
import { ChatShell } from "@exoskull/ui";
import { useState, useEffect } from "react";

export default function AppPage() {
  const engine = useChatEngine("/api/chat/stream");
  const [codePanelOpen, setCodePanelOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCodePanelOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="h-dvh w-full overflow-hidden bg-background flex"
      onDragOver={engine.handleDragOver}
      onDragLeave={engine.handleDragLeave}
      onDrop={engine.handleDrop}
    >
      {engine.isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <p className="text-lg font-medium text-primary">Drop files here</p>
        </div>
      )}

      <div className={codePanelOpen ? "w-1/2 border-r border-border" : "w-full"}>
        <div className="h-full flex flex-col">
          <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold tracking-tight">ExoSkull</h1>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted">
                v2
              </span>
            </div>
            <button
              onClick={() => setCodePanelOpen(!codePanelOpen)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
              title="Toggle code panel (Ctrl+B)"
            >
              {codePanelOpen ? "Hide code" : "Show code"}
            </button>
          </header>

          <ChatShell engine={engine} className="flex-1 min-h-0" />
        </div>
      </div>

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
            <p>Start a conversation — diffs and files will appear here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
