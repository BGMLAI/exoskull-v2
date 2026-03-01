"use client";

import { useState, useCallback } from "react";
import { cn } from "../common/utils";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

interface FileTreeProps {
  tree: FileNode[];
  onFileSelect: (path: string) => void;
  selectedPath?: string | null;
  className?: string;
}

/**
 * FileTree — recursive file/directory tree for project navigation.
 * Used in sidebar of Claude Code wrapper.
 */
export function FileTree({ tree, onFileSelect, selectedPath, className }: FileTreeProps) {
  return (
    <div className={cn("text-xs font-mono", className)}>
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  onFileSelect,
  selectedPath,
}: {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === "directory";
  const isSelected = node.path === selectedPath;

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(node.path);
    }
  }, [isDir, node.path, onFileSelect]);

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "w-full text-left px-2 py-0.5 hover:bg-muted/50 rounded-sm flex items-center gap-1.5 transition-colors",
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-[10px] text-muted-foreground w-3">
          {isDir ? (expanded ? "v" : ">") : " "}
        </span>
        <span className={cn(
          "truncate",
          isDir ? "text-muted-foreground" : "text-foreground",
        )}>
          {node.name}
        </span>
      </button>

      {isDir && expanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}
