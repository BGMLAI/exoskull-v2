"use client";

import { useRef, useEffect } from "react";
import type { Message } from "@exoskull/types";
import { cn } from "../common/utils";
import { CodeBlock } from "../code/CodeBlock";
import { DiffViewer } from "../code/DiffViewer";
import { TerminalOutput } from "../code/TerminalOutput";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  className?: string;
}

export function MessageList({ messages, isStreaming, className }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-2 text-muted-foreground">
          <p className="text-lg font-medium">ExoSkull v2</p>
          <p className="text-sm">Claude Code wrapper — napisz cokolwiek.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-y-auto px-4 py-6 space-y-4", className)}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isStreaming && (
        <div className="flex gap-1 px-4 py-2">
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.1s]" />
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card border border-border rounded-bl-md",
        )}
      >
        {/* Text content */}
        {message.content && (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls?.map((tool) => (
          <div
            key={tool.id}
            className="mt-2 px-3 py-2 rounded-lg bg-background/50 border border-border/50 text-xs"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                tool.status === "running" ? "bg-amber-500 animate-pulse" :
                tool.status === "done" ? "bg-emerald-500" :
                tool.status === "error" ? "bg-red-500" : "bg-muted"
              )} />
              <span className="font-mono">{tool.name}</span>
            </div>
            {tool.output && (
              <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                {tool.output.slice(0, 500)}
              </pre>
            )}
          </div>
        ))}

        {/* Attachments (diffs, terminal output, file changes) */}
        {message.attachments?.map((att) => (
          <div key={att.id} className="mt-2">
            {att.type === "diff" && att.content && (
              <DiffViewer data={JSON.parse(att.content)} />
            )}
            {att.type === "code" && att.content && (
              <TerminalOutput data={JSON.parse(att.content)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
