"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Cog, Hourglass, UploadCloud } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, Item, timeAgo } from "@/lib/api";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Hourglass className="h-4 w-4 text-amber-500" />,
  processing: <Cog className="h-4 w-4 animate-spin text-blue-500" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <CircleAlert className="h-4 w-4 text-red-500" />,
};

export default function FilesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    getJSON<Item[]>("/api/items").then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function upload(files: FileList | File[]) {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    setUploading(true);
    try {
      await fetch(`${API}/api/upload`, { method: "POST", body: form });
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <PageShell title="Files" subtitle="Everything you capture or upload, processed locally.">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-12 transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand/40"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-chip-purple">
          <UploadCloud className="h-6 w-6 text-brand" />
        </span>
        <div className="text-sm font-semibold">
          {uploading ? "Uploading…" : "Drop lectures, recordings, PDFs, slides or screenshots"}
        </div>
        <div className="text-xs text-muted">audio · video · pdf · images · text</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Processing queue</h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {items.length === 0 && <p className="p-5 text-sm text-muted">No files yet.</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
            {STATUS_ICON[it.status] ?? null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.title ?? it.filename}</div>
              <div className="truncate text-xs text-muted">
                {it.kind} · {timeAgo(it.created_at)}
                {it.subject ? ` · ${it.subject}` : ""}
                {it.error ? ` · ${it.error}` : ""}
              </div>
            </div>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
              it.status === "done" ? "bg-chip-green text-emerald-600"
              : it.status === "error" ? "bg-red-50 text-red-500"
              : "bg-chip-orange text-amber-600"
            }`}>
              {it.status}
            </span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
