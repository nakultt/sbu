"use client";

import { useCallback, useEffect, useState } from "react";
import { Headphones, Loader2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, Audiobook, getJSON, NotePreview, postJSON, timeAgo } from "@/lib/api";

export default function AudiobooksPage() {
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getJSON<Audiobook[]>("/api/audiobooks").then(setBooks).catch(() => {});
    getJSON<NotePreview[]>("/api/notes?limit=50").then(setNotes).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  async function generate() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const name = notes.find((n) => n.id === picked[0])?.title ?? "audiobook";
      await postJSON("/api/audiobooks", { note_ids: picked, name });
      setPicked([]);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Audiobooks" subtitle="Turn your notes into narrated audio with Kokoro.">
      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-semibold">Generate from notes</h2>
        {notes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No notes yet — process some material first.</p>
        ) : (
          <>
            <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <label key={n.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(n.id)}
                    onChange={(e) =>
                      setPicked((p) => e.target.checked ? [...p, n.id] : p.filter((x) => x !== n.id))
                    }
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="flex-1 truncate">{n.title ?? "Untitled"}</span>
                  {n.subject && <span className="text-xs text-muted">{n.subject}</span>}
                </label>
              ))}
            </div>
            <button
              onClick={generate}
              disabled={!picked.length || busy}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Narrating… (this takes a while)" : "🎧 Generate audiobook"}
            </button>
          </>
        )}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Your audiobooks</h2>
      <div className="space-y-3">
        {books.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        {books.map((b) => (
          <div key={b.name} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-purple">
                <Headphones className="h-5 w-5 text-brand" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {b.name.replace(/_\d+\.wav$/, "").replaceAll("_", " ")}
                </div>
                <div className="text-xs text-muted">{b.size_mb} MB · {timeAgo(b.created_at)}</div>
              </div>
            </div>
            <audio controls preload="none" className="mt-3 w-full" src={`${API}/api/audiobooks/${b.name}`} />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
