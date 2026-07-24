"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import PageShell from "@/components/PageShell";
import { getJSON, NotePreview, shortDate } from "@/lib/api";

interface NoteDetail {
  id: number;
  markdown: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, string>>({});

  useEffect(() => {
    getJSON<NotePreview[]>("/api/notes?limit=100").then(setNotes).catch(() => {});
  }, []);

  async function toggle(id: number) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!detail[id]) {
      const d = await getJSON<NoteDetail>(`/api/notes/${id}`);
      setDetail((prev) => ({ ...prev, [id]: d.markdown }));
    }
  }

  return (
    <PageShell title="Notes" subtitle="Generated study notes, organised by subject.">
      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-sm text-muted">No notes yet — upload material on the Files page.</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="rounded-2xl border border-line bg-white">
            <button onClick={() => toggle(n.id)} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip-purple">
                <FileText className="h-4.5 w-4.5 text-brand" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{n.title ?? "Untitled"}</span>
                  {n.subject && (
                    <span className="rounded-md bg-chip-purple px-2 py-0.5 text-[11px] font-medium text-brand">
                      {n.subject}
                    </span>
                  )}
                </div>
                <p className="truncate text-[13px] text-muted">{n.preview}…</p>
              </div>
              <span className="text-xs text-muted">{shortDate(n.created_at)}</span>
              {open === n.id ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
            </button>
            {open === n.id && (
              <div className="prose prose-sm max-w-none border-t border-line px-5 py-4 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm">
                <ReactMarkdown>{detail[n.id] ?? "Loading…"}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
