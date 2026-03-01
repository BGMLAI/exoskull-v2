"use client";

import { cn } from "../common/utils";

interface DiffData {
  file: string;
  diff: string;
  language?: string;
}

interface DiffViewerProps {
  data: DiffData;
  className?: string;
}

/**
 * DiffViewer — renders code diffs with green/red line highlighting.
 * Inline in chat messages when Claude Code modifies files.
 */
export function DiffViewer({ data, className }: DiffViewerProps) {
  const lines = data.diff.split("\n");

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden text-xs", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span className="font-mono text-[10px] text-muted-foreground truncate">
          {data.file}
        </span>
      </div>

      {/* Diff lines */}
      <pre className="p-0 overflow-x-auto">
        {lines.map((line, i) => {
          const isAdd = line.startsWith("+") && !line.startsWith("+++");
          const isDel = line.startsWith("-") && !line.startsWith("---");
          const isHeader = line.startsWith("@@");

          return (
            <div
              key={i}
              className={cn(
                "px-3 py-0.5 font-mono leading-relaxed",
                isAdd && "bg-emerald-500/10 text-emerald-400",
                isDel && "bg-red-500/10 text-red-400",
                isHeader && "bg-primary/5 text-primary/70",
                !isAdd && !isDel && !isHeader && "text-muted-foreground",
              )}
            >
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
