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
}

/**
 * ChatShell — complete chat interface with voice mode.
 * MessageList (scrollable) + InputBar (bottom) + VoiceMode (overlay).
 */
export function ChatShell({ engine, className }: ChatShellProps) {
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);

  // Get last assistant message for TTS
  const lastAssistantMsg = [...engine.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const handleVoiceClose = useCallback(() => {
    setVoiceModeOpen(false);
  }, []);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Error banner */}
      {engine.error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b border-destructive/20">
          {engine.error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0">
        <MessageList
          messages={engine.messages}
          isStreaming={engine.isStreaming}
          className="h-full"
        />
      </div>

      {/* Input */}
      <div className="shrink-0 p-4 pt-0">
        <InputBar
          onSend={(msg) => engine.sendMessage(msg)}
          isStreaming={engine.isStreaming}
          onCancel={engine.cancelStream}
          onVoiceMode={() => setVoiceModeOpen(true)}
        />
      </div>

      {/* Voice mode overlay */}
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
