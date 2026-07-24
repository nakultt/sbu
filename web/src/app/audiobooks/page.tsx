"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Headphones, Loader2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, Audiobook, getJSON, NotePreview, postJSON, timeAgo } from "@/lib/api";

interface Job {
  id: number;
  name: string;
  status: "processing" | "done" | "error";
  error: string | null;
  file: string | null;
  created_at: number;
}

export default function AudiobooksPage() {
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [picked, setPicked] = useState<number[]>([]);

  const refresh = useCallback(() => {
    getJSON<Audiobook[]>("/api/audiobooks").then(setBooks).catch(() => {});
    getJSON<NotePreview[]>("/api/notes?limit=50").then(setNotes).catch(() => {});
    getJSON<Job[]>("/api/audiobooks/jobs").then(setJobs).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const busy = jobs.some((j) => j.status === "processing");

  async function generate() {
    if (!picked.length) return;
    const name = notes.find((n) => n.id === picked[0])?.title ?? "audiobook";
    await postJSON("/api/audiobooks", { note_ids: picked, name });
    setPicked([]);
    refresh();
  }

  return (
    <PageShell title="Audiobooks" subtitle="Turn your notes into narrated audio with Kokoro.">
      <div className="surface p-5">
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
              disabled={!picked.length}
              className="mt-4 button-primary disabled:opacity-50"
            >
              🎧 Generate audiobook
            </button>
          </>
        )}
      </div>

      {jobs.filter((j) => j.status !== "done").length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Generation queue</h2>
          <div className="space-y-2">
            {jobs.filter((j) => j.status !== "done").map((j) => (
              <div key={j.id} className="flex items-center gap-3 surface px-4 py-3 text-sm">
                {j.status === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                ) : (
                  <CircleAlert className="h-4 w-4 text-red-500" />
                )}
                <span className="flex-1 truncate font-medium">{j.name}</span>
                <span className="text-xs text-muted">
                  {j.status === "processing"
                    ? "Writing narration + synthesizing… this takes a few minutes"
                    : j.error}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Your audiobooks</h2>
      <div className="space-y-3">
        {books.length === 0 && !busy && <p className="text-sm text-muted">Nothing here yet.</p>}
        {books.map((b) => (
          <div key={b.name} className="surface p-4">
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
