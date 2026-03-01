"use client";

import { useState, useCallback } from "react";
import { cn } from "../common/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}

/**
 * CodeBlock — syntax-highlighted code display with copy button.
 * Simple implementation — no external syntax highlighter dependency.
 */
export function CodeBlock({ code, language, filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-[10px] font-mono text-muted-foreground">
          {filename || language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? "Skopiowano!" : "Kopiuj"}
        </button>
      </div>

      {/* Code */}
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
