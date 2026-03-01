"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "../common/utils";

interface InputBarProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  onCancel?: () => void;
  onVoiceMode?: () => void;
  placeholder?: string;
  className?: string;
}

export function InputBar({
  onSend,
  isStreaming,
  onCancel,
  onVoiceMode,
  placeholder = "Napisz wiadomosc... (Ctrl+Enter aby wyslac)",
  className,
}: InputBarProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && input.split("\n").length <= 1) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, input],
  );

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg backdrop-blur-xl",
        className,
      )}
    >
      {/* Voice mode button */}
      {onVoiceMode && (
        <button
          onClick={onVoiceMode}
          disabled={isStreaming}
          className={cn(
            "shrink-0 rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all",
            isStreaming && "opacity-30 cursor-not-allowed",
          )}
          title="Tryb glosowy"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </button>
      )}

      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground px-2 py-1.5 max-h-[200px]"
        disabled={isStreaming}
      />

      {isStreaming ? (
        <button
          onClick={onCancel}
          className="shrink-0 rounded-xl bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Wyslij
        </button>
      )}
    </div>
  );
}
