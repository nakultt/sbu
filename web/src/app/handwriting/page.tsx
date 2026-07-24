"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Loader2, PenLine, Send, Sparkles, Upload } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, HwLine, HwPage, HwPageDetail, HwStatus, postJSON, timeAgo } from "@/lib/api";

function LineEditor({ line, onSaved }: { line: HwLine; onSaved: () => void }) {
  const [text, setText] = useState(line.corrected_text ?? line.pred_text);
  const [saved, setSaved] = useState(false);
  const corrected = line.corrected_text !== null;

  async function save() {
    const trimmed = text.trim();
    // no-op when the text still matches the model's prediction and was never corrected
    if (!corrected && trimmed === line.pred_text.trim()) return;
    await fetch(`${API}/api/handwriting/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_text: trimmed }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <div className="surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${API}${line.crop_url}`}
        alt={`Handwritten line ${line.line_index + 1}`}
        className="max-h-24 w-full rounded-lg border border-line bg-page object-contain"
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="(empty — type what this line says)"
          className="flex-1 rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {saved ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : corrected ? (
          <span className="shrink-0 rounded-full bg-chip-green px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            corrected
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function HandwritingPage() {
  const [pages, setPages] = useState<HwPage[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<HwPageDetail | null>(null);
  const [status, setStatus] = useState<HwStatus | null>(null);
  const [sentToNotes, setSentToNotes] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    getJSON<HwPage[]>("/api/handwriting/pages").then(setPages).catch(() => {});
    getJSON<HwStatus>("/api/handwriting/status").then(setStatus).catch(() => {});
  }, []);

  const loadDetail = useCallback((id: number) => {
    getJSON<HwPageDetail>(`/api/handwriting/pages/${id}`).then(setDetail).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (selected !== null) loadDetail(selected);
  }, [selected, loadDetail]);

  function selectPage(id: number) {
    setSentToNotes(false);
    setSelected(id);
  }

  // keep polling the open page while it is still being recognized
  useEffect(() => {
    if (selected === null || detail?.status !== "processing") return;
    const t = setInterval(() => loadDetail(selected), 2000);
    return () => clearInterval(t);
  }, [selected, detail?.status, loadDetail]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    const res = await fetch(`${API}/api/handwriting/upload`, { method: "POST", body: form });
    const data = await res.json();
    refresh();
    if (data.page_ids?.length) selectPage(data.page_ids[0]);
  }

  async function toNotes() {
    if (selected === null) return;
    await postJSON(`/api/handwriting/pages/${selected}/to-notes`, {});
    setSentToNotes(true);
  }

  const corrected = status?.corrected_lines ?? 0;

  return (
    <PageShell
      title="Handwriting"
      subtitle="Read handwritten pages with your local vision model — correct a line and it learns your words."
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="font-semibold">Upload a page</h2>
            <p className="mt-1 text-xs text-muted">
              Photos or scans of handwritten notes (multi-line pages are fine).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white"
            >
              <Upload className="h-4 w-4" /> Choose images
            </button>
          </div>

          <div className="surface p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-brand" /> Learns your words
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Every line you correct is remembered and passed to the vision model
              as a hint on the next page, so it resolves your ambiguous words
              toward what you actually write.
            </p>
            <div className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand">
              {corrected} corrected line{corrected === 1 ? "" : "s"} learned
            </div>
          </div>

          <div className="surface p-3">
            <h2 className="px-2 pt-1 text-sm font-semibold">Pages</h2>
            <div className="mt-2 max-h-96 space-y-1 overflow-y-auto">
              {pages.length === 0 && (
                <p className="px-2 pb-2 text-xs text-muted">No pages yet.</p>
              )}
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPage(p.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm ${
                    selected === p.id ? "bg-brand-soft text-brand" : "hover:bg-panel-muted"
                  }`}
                >
                  {p.status === "processing" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
                  ) : p.status === "error" ? (
                    <CircleAlert className="h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <PenLine className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.filename}</span>
                    <span className="block text-[11px] text-muted">
                      {p.line_count ?? 0} lines · {p.corrected_count ?? 0} corrected · {timeAgo(p.created_at)}
                      {p.item_id !== null && " · via capture"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          {!detail ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
              Upload a page or pick one from the list.
            </div>
          ) : detail.status === "processing" ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 surface text-sm text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
              Reading your handwriting line by line…
            </div>
          ) : detail.status === "error" ? (
            <div className="surface p-6 text-sm text-red-500">
              Recognition failed: {detail.error}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate font-semibold">{detail.filename}</h2>
                <button
                  onClick={toNotes}
                  disabled={sentToNotes}
                  className="inline-flex items-center gap-2 button-secondary disabled:opacity-60"
                >
                  {sentToNotes ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-500" /> Sent to notes
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Send to notes
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted">
                Fix any line below — edits save when you leave the field and become training
                examples for your personal model.
              </p>
              {detail.lines.map((line) => (
                <LineEditor key={line.id} line={line} onSaved={() => { refresh(); }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
