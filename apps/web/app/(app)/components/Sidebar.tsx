"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Chat", icon: "💬" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`shrink-0 flex flex-col border-r border-border bg-card/50 transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">ExoSkull</span>
            <span className="text-[10px] text-muted-foreground px-1 py-0.5 rounded bg-muted">v2</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-3 py-3 border-t border-border">
        {!collapsed && (
          <p className="text-[10px] text-muted-foreground">
            Goal Executor
          </p>
        )}
      </div>
    </aside>
  );
}
