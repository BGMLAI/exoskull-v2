"use client";

import { cn } from "../common/utils";

interface TerminalData {
  command: string;
  output: string;
  exitCode: number;
}

interface TerminalOutputProps {
  data: TerminalData;
  className?: string;
}

/**
 * TerminalOutput — renders bash/terminal output inline in chat.
 * Shows command, output, and exit code with appropriate styling.
 */
export function TerminalOutput({ data, className }: TerminalOutputProps) {
  const isError = data.exitCode !== 0;

  return (
    <div className={cn("rounded-lg border overflow-hidden text-xs",
      isError ? "border-red-500/30" : "border-border",
      className
    )}>
      {/* Command line */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-emerald-500 font-mono text-[10px]">$</span>
        <span className="font-mono text-[10px] text-foreground truncate">
          {data.command}
        </span>
        {isError && (
          <span className="ml-auto text-[9px] text-red-400 font-mono">
            exit {data.exitCode}
          </span>
        )}
      </div>

      {/* Output */}
      {data.output && (
        <pre className="p-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground max-h-[300px]">
          {data.output}
        </pre>
      )}
    </div>
  );
}
