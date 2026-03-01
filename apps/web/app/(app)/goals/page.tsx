"use client";

import { useEffect, useState, useCallback } from "react";

interface GoalNode {
  id: string;
  title: string;
  description: string | null;
  depth: number;
  status: string;
  progress: number;
  priority: number;
  due_at: string | null;
  children: GoalNode[];
}

const DEPTH_LABELS = ["VALUE", "AREA", "QUEST", "TASK"];
const DEPTH_COLORS = [
  "border-l-amber-500",
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-green-500",
];

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) {
      const data = await res.json();
      setGoals(data);
      // Auto-expand top-level
      setExpanded(new Set(data.map((g: GoalNode) => g.id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updateGoalStatus(id: string, status: string) {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchGoals();
  }

  function renderNode(node: GoalNode, level = 0) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const depthLabel = DEPTH_LABELS[node.depth] || "GOAL";
    const borderColor = DEPTH_COLORS[node.depth] || "border-l-gray-500";
    const progressPct = Math.round(node.progress * 100);

    return (
      <div key={node.id} className={level > 0 ? "ml-6" : ""}>
        <div
          className={`border-l-2 ${borderColor} bg-card rounded-r-lg mb-1.5 transition-colors hover:bg-card/80`}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Expand/collapse */}
            <button
              onClick={() => hasChildren && toggleExpand(node.id)}
              className={`w-5 h-5 flex items-center justify-center text-xs rounded ${
                hasChildren ? "hover:bg-muted cursor-pointer text-muted-foreground" : "invisible"
              }`}
            >
              {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
            </button>

            {/* Depth badge */}
            <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0">
              {depthLabel}
            </span>

            {/* Title */}
            <span className="flex-1 text-sm font-medium truncate">{node.title}</span>

            {/* Priority */}
            <span className="text-[10px] text-muted-foreground shrink-0">
              P{node.priority}
            </span>

            {/* Progress bar */}
            <div className="w-20 shrink-0">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    progressPct === 100 ? "bg-green-500" : "bg-primary"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">{progressPct}%</span>
            </div>

            {/* Status */}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                node.status === "completed"
                  ? "bg-green-500/10 text-green-600"
                  : node.status === "paused"
                    ? "bg-yellow-500/10 text-yellow-600"
                    : "bg-blue-500/10 text-blue-600"
              }`}
            >
              {node.status}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {node.status === "active" && node.depth === 3 && (
                <button
                  onClick={() => updateGoalStatus(node.id, "completed")}
                  className="text-[10px] text-green-600 hover:text-green-500 px-1"
                  title="Complete"
                >
                  ✓
                </button>
              )}
              <button
                onClick={() => { setAddParentId(node.id); setShowAdd(true); }}
                className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                title="Add child"
              >
                +
              </button>
            </div>
          </div>

          {/* Description (if expanded) */}
          {isExpanded && node.description && (
            <p className="px-3 pb-2 pl-10 text-xs text-muted-foreground">
              {node.description}
            </p>
          )}
        </div>

        {/* Children */}
        {isExpanded && node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">Goals</h1>
        <button
          onClick={() => { setAddParentId(null); setShowAdd(true); }}
          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          + New Goal
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-muted-foreground">Loading goals...</span>
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-2xl mb-2">🎯</p>
            <p className="text-sm font-medium mb-1">No goals yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Define your first goal and ExoSkull will help you achieve it.
            </p>
            <button
              onClick={() => { setAddParentId(null); setShowAdd(true); }}
              className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-lg"
            >
              Define First Goal
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {goals.map((g) => renderNode(g))}
          </div>
        )}
      </div>

      {/* Add Goal Modal */}
      {showAdd && (
        <AddGoalModal
          parentId={addParentId}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchGoals(); }}
        />
      )}
    </div>
  );
}

// ── Add Goal Modal ─────────────────────────────────────────────────────

function AddGoalModal({
  parentId,
  onClose,
  onCreated,
}: {
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [depth, setDepth] = useState(parentId ? 3 : 0);
  const [priority, setPriority] = useState(5);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        depth,
        parent_id: parentId,
        priority,
      }),
    });
    setSaving(false);
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-lg"
      >
        <h2 className="text-sm font-semibold mb-4">
          {parentId ? "Add Sub-Goal" : "New Goal"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g., Learn Spanish, Save $10k, Run a marathon"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={2}
              placeholder="Why this matters, how you'll achieve it..."
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Level</label>
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg"
              >
                <option value={0}>Value (life area)</option>
                <option value={1}>Area (project)</option>
                <option value={2}>Quest (milestone)</option>
                <option value={3}>Task (actionable)</option>
              </select>
            </div>
            <div className="w-20">
              <label className="text-xs text-muted-foreground block mb-1">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={1}
                max={10}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
