"use client";

import { useEffect, useState } from "react";

interface FileItem {
  id: string;
  filename: string;
  size_bytes: number;
  kind: string;
  created_at: string;
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/files")
      .then((r) => r.ok ? r.json() : [])
      .then(setFiles)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Ladowanie plikow...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
        <h1 className="text-lg font-semibold">Pliki</h1>
        <span className="text-xs text-muted-foreground">{files.length} plikow</span>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {files.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">Brak plikow</p>
            <p className="text-sm">Wgraj pliki przez czat (ikona spinacza).</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                    {f.kind === "image" ? "IMG" : f.kind === "audio" ? "AUD" : "DOC"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{f.filename || "Bez nazwy"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {f.kind}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
