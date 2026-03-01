import { useState, useCallback, useRef } from "react";
import type {
  Message,
  StreamEvent,
  ToolCall,
  Attachment,
} from "@exoskull/types";
import { parseSSEStream } from "./stream-parser";

export interface ChatEngineState {
  messages: Message[];
  isStreaming: boolean;
  currentToolCalls: ToolCall[];
  error: string | null;
  isDragging: boolean;
}

export interface UseChatEngineReturn extends ChatEngineState {
  sendMessage: (content: string, type?: "text" | "voice") => Promise<void>;
  cancelStream: () => void;
  clearMessages: () => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  replyTo: { senderRole: string; preview: string } | null;
  setReplyTo: (r: { senderRole: string; preview: string } | null) => void;
}

/**
 * Core chat engine hook — manages messages, streaming, tool calls.
 * Shared between web and desktop apps.
 */
export function useChatEngine(apiEndpoint = "/api/chat/stream"): UseChatEngineReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<{ senderRole: string; preview: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, type: "text" | "voice" = "text") => {
      if (!content.trim() || isStreaming) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        threadId: "current",
        role: "user",
        content: content.trim(),
        channel: "web_chat",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setError(null);
      setCurrentToolCalls([]);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        threadId: "current",
        role: "assistant",
        content: "",
        channel: "web_chat",
        toolCalls: [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      try {
        abortRef.current = new AbortController();

        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            type,
            threadId: "current",
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        for await (const event of parseSSEStream(res)) {
          handleStreamEvent(event, assistantMsg.id);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("[ChatEngine] Stream error:", err);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [apiEndpoint, isStreaming],
  );

  const handleStreamEvent = useCallback(
    (event: StreamEvent, msgId: string) => {
      switch (event.type) {
        case "delta": {
          const { text } = event.data as { text: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, content: m.content + text } : m,
            ),
          );
          break;
        }
        case "tool_start": {
          const tool = event.data as ToolCall;
          setCurrentToolCalls((prev) => [...prev, { ...tool, status: "running" }]);
          break;
        }
        case "tool_end": {
          const tool = event.data as ToolCall;
          setCurrentToolCalls((prev) =>
            prev.map((t) => (t.id === tool.id ? { ...t, ...tool, status: "done" } : t)),
          );
          // Also attach to message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, toolCalls: [...(m.toolCalls || []), tool] }
                : m,
            ),
          );
          break;
        }
        case "code_diff":
        case "terminal_output":
        case "file_change": {
          // Attach as attachment to message
          const attachment: Attachment = {
            id: crypto.randomUUID(),
            type: event.type === "code_diff" ? "diff" : event.type === "terminal_output" ? "code" : "file",
            name: event.type,
            content: JSON.stringify(event.data),
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, attachments: [...(m.attachments || []), attachment] }
                : m,
            ),
          );
          break;
        }
        case "error": {
          const { message } = event.data as { message: string };
          setError(message);
          break;
        }
      }
    },
    [],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // TODO: Handle file drops → upload → attach to message
  }, []);

  return {
    messages,
    isStreaming,
    currentToolCalls,
    error,
    isDragging,
    sendMessage,
    cancelStream,
    clearMessages,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    replyTo,
    setReplyTo,
  };
}
