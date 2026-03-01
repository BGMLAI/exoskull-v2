"use client";

import { useState, useCallback } from "react";
import type { UseChatEngineReturn } from "@exoskull/engine";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { VoiceMode } from "./VoiceMode";
import { cn } from "../common/utils";

interface ChatShellProps {
  engine: UseChatEngineReturn;
  className?: string;
  uploadUrl?: string;
}

/**
 * ChatShell — complete chat interface with voice mode + file upload.
 */
export function ChatShell({
  engine,
  className,
  uploadUrl = "/api/upload",
}: ChatShellProps) {
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);

  const lastAssistantMsg = [...engine.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const handleVoiceClose = useCallback(() => {
    setVoiceModeOpen(false);
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(uploadUrl, { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          engine.sendMessage(
            `[Nie udalo sie wgrac pliku: ${err.error || "blad"}]`,
          );
          return;
        }

        const data = await res.json();
        // Tell the agent about the uploaded file
        engine.sendMessage(
          `Wgralem plik "${data.filename}" (${formatBytes(data.size)}, ${data.extracted_chars} znakow tekstu). Przeanalizuj go.`,
        );
      } catch {
        engine.sendMessage("[Blad wgrywania pliku]");
      }
    },
    [uploadUrl, engine],
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {engine.error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b border-destructive/20">
          {engine.error}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <MessageList
          messages={engine.messages}
          isStreaming={engine.isStreaming}
          className="h-full"
        />
      </div>

      <div className="shrink-0 p-4 pt-0">
        <InputBar
          onSend={(msg) => engine.sendMessage(msg)}
          onFileUpload={handleFileUpload}
          isStreaming={engine.isStreaming}
          onCancel={engine.cancelStream}
          onVoiceMode={() => setVoiceModeOpen(true)}
        />
      </div>

      {voiceModeOpen && (
        <VoiceMode
          onSend={(msg) => engine.sendMessage(msg)}
          isStreaming={engine.isStreaming}
          lastAssistantMessage={lastAssistantMsg?.content}
          onClose={handleVoiceClose}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
