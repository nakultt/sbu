"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ChevronDown, Download, FileText, Folder, FolderInput, FolderPlus,
  Pencil, Play, Trash2, Upload, X,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import NoteMarkdown from "@/components/NoteMarkdown";
import NoteEditor from "@/components/NoteEditor";
import VideoModal from "@/components/VideoModal";
import { API, getJSON, NotePreview, shortDate, Subject } from "@/lib/api";
import { cleanStudyMarkdown } from "@/lib/markdown";
import { NoteContext } from "@/lib/noteLinks";

interface VideoSeek {
  src: string;
  timestamp: number;
  label: string;
}

interface NoteDetail {
  id: number;
  markdown: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [busyNote, setBusyNote] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [videoSeek, setVideoSeek] = useState<VideoSeek | null>(null);
  const [message, setMessage] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    Promise.all([
      getJSON<NotePreview[]>("/api/notes?limit=1000"),
      getJSON<Subject[]>("/api/subjects"),
    ]).then(async ([loaded, loadedSubjects]) => {
      setNotes(loaded);
      setSubjects(loadedSubjects);
      const requested = Number(new URLSearchParams(window.location.search).get("note"));
      const requestedNote = loaded.find((note) => note.id === requested);
      if (requested > 0 && requestedNote) {
        setOpenFolders((current) => new Set(current).add(
          requestedNote.subject_id == null ? "unfiled" : `subject-${requestedNote.subject_id}`
        ));
        setOpen(requested);
        const note = await getJSON<NoteDetail>(`/api/notes/${requested}`);
        setDetail((previous) => ({ ...previous, [requested]: note.markdown }));
        window.setTimeout(() => document.getElementById(`note-${requested}`)?.scrollIntoView({
          behavior: "smooth", block: "start",
        }), 0);
      }
    }).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  async function toggle(id: number) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!detail[id]) {
      const d = await getJSON<NoteDetail>(`/api/notes/${id}`);
      setDetail((prev) => ({ ...prev, [id]: d.markdown }));
    }
  }

  async function importBackup(file: File) {
    const form = new FormData();
    form.append("backup", file);
    setImporting(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/notes/import`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Import failed");
      const result = body as ImportResult;
      setMessage(`Imported ${result.imported} note${result.imported === 1 ? "" : "s"}${
        result.skipped ? `; skipped ${result.skipped} already present or empty` : ""
      }.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    setMessage("");
    try {
      const res = await fetch(`${API}/api/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Could not create folder");
      const subject = body as Subject;
      setSubjects((current) => current.some((entry) => entry.id === subject.id)
        ? current
        : [...current, subject].sort((a, b) => a.name.localeCompare(b.name)));
      setOpenFolders((current) => new Set(current).add(`subject-${subject.id}`));
      setNewFolder("");
      setCreatingFolder(false);
      setMessage(`Created “${subject.name}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create folder");
    }
  }

  async function moveNote(note: NotePreview, subjectId: number) {
    const subject = subjects.find((entry) => entry.id === subjectId);
    if (!subject || note.subject_id === subjectId) return;
    setBusyNote(note.id);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Could not move note");
      setNotes((current) => current.map((entry) => entry.id === note.id
        ? { ...entry, subject_id: subject.id, subject: subject.name }
        : entry));
      setOpenFolders((current) => new Set(current).add(`subject-${subject.id}`));
      setMessage(`Moved “${note.title ?? "Untitled"}” to ${subject.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not move note");
    } finally {
      setBusyNote(null);
    }
  }

  async function deleteNote(note: NotePreview) {
    if (!window.confirm(
      `Delete “${note.title ?? "Untitled"}”? The original uploaded material will stay in your Library.`
    )) return;
    setBusyNote(note.id);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/notes/${note.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Could not delete note");
      setNotes((current) => current.filter((entry) => entry.id !== note.id));
      setDetail((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      if (open === note.id) setOpen(null);
      setMessage(`Deleted “${note.title ?? "Untitled"}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete note");
    } finally {
      setBusyNote(null);
    }
  }

  async function startEdit(note: NotePreview) {
    if (open !== note.id) setOpen(note.id);
    if (!detail[note.id]) {
      const d = await getJSON<NoteDetail>(`/api/notes/${note.id}`);
      setDetail((prev) => ({ ...prev, [note.id]: d.markdown }));
    }
    setEditing(note.id);
  }

  async function saveNote(note: NotePreview, markdown: string) {
    setSavingNote(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Could not save note");
      setDetail((prev) => ({ ...prev, [note.id]: body.markdown }));
      setEditing(null);
      setMessage(`Saved “${note.title ?? "Untitled"}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save note");
    } finally {
      setSavingNote(false);
    }
  }

  function toggleFolder(key: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function noteContext(n: NotePreview): NoteContext {
    return { itemId: n.item_id, kind: n.kind, title: n.title ?? "Note", subjectName: n.subject };
  }

  const folders = [
    ...subjects.map((subject) => ({
      key: `subject-${subject.id}`,
      id: subject.id,
      name: subject.name,
      notes: notes.filter((note) => note.subject_id === subject.id),
    })),
    ...(notes.some((note) => note.subject_id == null) ? [{
      key: "unfiled",
      id: null,
      name: "Unfiled",
      notes: notes.filter((note) => note.subject_id == null),
    }] : []),
  ];

  return (
    <PageShell title="Notes" subtitle="Generated study notes, organised by subject.">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <a
          href={`${API}/api/notes/export`}
          className="button-primary"
        >
          <Download className="h-4 w-4" />
          Export all notes
        </a>
        <button
          onClick={() => importRef.current?.click()}
          disabled={importing}
          className="button-secondary disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {importing ? "Importing…" : "Import notes"}
        </button>
        <button
          onClick={() => setCreatingFolder((current) => !current)}
          className="button-secondary"
          aria-expanded={creatingFolder}
        >
          <FolderPlus className="h-4 w-4" />
          New folder
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,text/markdown,.json,.md,.markdown,.txt"
          hidden
          onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])}
        />
        <span className="text-xs text-muted">Import a JSON backup or an individual Markdown note.</span>
      </div>
      {creatingFolder && (
        <form
          className="mb-4"
          onSubmit={(event) => { event.preventDefault(); createFolder(); }}
        >
          <div className="flex max-w-xl items-center gap-2 rounded-xl border border-line bg-panel p-2">
            <Folder className="ml-2 h-4 w-4 shrink-0 text-brand" />
            <input
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none"
              value={newFolder}
              onChange={(event) => setNewFolder(event.target.value)}
              placeholder="Folder name, e.g. Computer Science"
              maxLength={80}
              autoFocus
            />
            <button className="rounded-lg bg-brand p-2 text-white disabled:opacity-50" disabled={!newFolder.trim()} aria-label="Create folder">
              <Check className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { setCreatingFolder(false); setNewFolder(""); }} className="rounded-lg p-2 text-muted hover:bg-panel-muted" aria-label="Cancel folder creation">
              <X className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm" role="status">
          {message}
        </p>
      )}
      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-sm text-muted">No notes yet — upload material on the Files page.</p>
        )}
        {folders.map((folder) => (
          <section key={folder.key} className="surface overflow-hidden">
            <button
              onClick={() => toggleFolder(folder.key)}
              className="flex w-full items-center gap-3 p-4 text-left sm:px-5"
              aria-expanded={openFolders.has(folder.key)}
              aria-controls={`folder-content-${folder.key}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip-purple text-brand">
                <Folder className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{folder.name}</span>
                <span className="text-xs text-muted">{folder.notes.length} note{folder.notes.length === 1 ? "" : "s"}</span>
              </span>
              <ChevronDown className={`h-4 w-4 text-muted transition-transform ${openFolders.has(folder.key) ? "rotate-180" : ""}`} />
            </button>
            {openFolders.has(folder.key) && (
              <div
                id={`folder-content-${folder.key}`}
                className="border-t border-line bg-page/35"
              >
                <div className="space-y-2 p-3 sm:p-4">
                  {folder.notes.length === 0 && (
                    <p className="px-2 py-4 text-sm text-muted">This folder is empty. Move a note here using its folder menu.</p>
                  )}
                  {folder.notes.map((n) => (
                    <div
                      id={`note-${n.id}`}
                      key={n.id}
                      className="scroll-mt-20 overflow-hidden rounded-xl border border-line bg-panel"
                    >
                      <div className="flex items-center">
                        <button
                          onClick={() => toggle(n.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left sm:p-4"
                          aria-expanded={open === n.id}
                          aria-controls={`note-content-${n.id}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip-purple">
                            <FileText className="h-4.5 w-4.5 text-brand" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{n.title ?? "Untitled"}</span>
                            <span className="block truncate text-[13px] text-muted">{cleanStudyMarkdown(n.preview)}…</span>
                          </span>
                          <span className="hidden text-xs text-muted md:block">{shortDate(n.created_at)}</span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open === n.id ? "rotate-180" : ""}`} />
                        </button>
                        <div className="mr-2 flex shrink-0 items-center gap-0.5 sm:mr-3">
                          <button
                            onClick={() => startEdit(n)}
                            disabled={busyNote === n.id}
                            className="rounded-lg p-2 text-muted hover:bg-brand-soft hover:text-brand disabled:opacity-50"
                            aria-label={`Edit ${n.title ?? "note"}`}
                            title="Edit note"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <label className="relative flex items-center rounded-lg text-muted hover:bg-brand-soft hover:text-brand" title="Move to folder">
                            <FolderInput className="pointer-events-none absolute left-2 h-4 w-4" />
                            <select
                              value=""
                              onChange={(event) => moveNote(n, Number(event.target.value))}
                              disabled={busyNote === n.id}
                              className="h-8 w-8 cursor-pointer appearance-none rounded-lg bg-transparent pl-8 text-transparent outline-none sm:w-[6.4rem] sm:pr-2 sm:text-xs sm:text-current"
                              aria-label={`Move ${n.title ?? "note"} to folder`}
                            >
                              <option value="" disabled>Move…</option>
                              {subjects.map((subject) => (
                                <option key={subject.id} value={subject.id} disabled={subject.id === n.subject_id}>{subject.name}</option>
                              ))}
                            </select>
                          </label>
                          <a
                            href={`${API}/api/notes/${n.id}/download`}
                            className="rounded-lg p-2 text-muted hover:bg-brand-soft hover:text-brand"
                            aria-label={`Download ${n.title ?? "note"} as Markdown`}
                            title="Download as Markdown"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => deleteNote(n)}
                            disabled={busyNote === n.id}
                            className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Delete ${n.title ?? "note"}`}
                            title="Delete note"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {open === n.id && (
                        <div
                          id={`note-content-${n.id}`}
                          className="border-t border-line bg-page/35 px-5 py-5 sm:px-7 sm:py-7"
                        >
                          {n.kind === "video" && editing !== n.id && <div className="not-prose mb-5 rounded-xl bg-black p-2"><div className="mb-2 flex items-center gap-2 px-2 text-sm font-medium text-white"><Play className="h-4 w-4" />Lecture video</div><video controls className="max-h-[65vh] w-full rounded-lg" src={`${API}/api/video/items/${n.item_id}/file`} /></div>}
                          {detail[n.id] ? (
                            editing === n.id ? (
                              <NoteEditor
                                initialMarkdown={detail[n.id]}
                                ctx={noteContext(n)}
                                saving={savingNote}
                                onSave={(markdown) => saveNote(n, markdown)}
                                onCancel={() => setEditing(null)}
                              />
                            ) : (
                              <article className="study-note mx-auto max-w-4xl">
                                <NoteMarkdown
                                  markdown={detail[n.id]}
                                  ctx={noteContext(n)}
                                  onSeek={(seconds) => setVideoSeek({
                                    src: `${API}/api/video/items/${n.item_id}/file`,
                                    timestamp: seconds,
                                    label: n.title ?? "Lecture",
                                  })}
                                />
                              </article>
                            )
                          ) : (
                            <div className="note-loading mx-auto max-w-4xl" aria-label="Loading note" role="status">
                              <span /><span /><span />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      {videoSeek && (
        <VideoModal
          src={videoSeek.src}
          timestamp={videoSeek.timestamp}
          label={videoSeek.label}
          onClose={() => setVideoSeek(null)}
        />
      )}
    </PageShell>
  );
}
