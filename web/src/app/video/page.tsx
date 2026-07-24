"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, LoaderCircle, Play, ScanText, Table2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, postJSON, VideoFrame, VideoSegment } from "@/lib/api";

function timestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function VideoReviewPage() {
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [selected, setSelected] = useState<VideoFrame | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [error, setError] = useState("");

  const loadFrames = useCallback(() => {
    getJSON<VideoFrame[]>("/api/video/frames").then(setFrames).catch(() => {});
  }, []);
  useEffect(() => { loadFrames(); }, [loadFrames]);

  async function choose(frame: VideoFrame) {
    setError("");
    const detail = await getJSON<VideoFrame>(`/api/video/frames/${frame.id}`);
    setSelected(detail);
    setSegments(detail.segments ?? []);
  }

  function startStreaming() {
    if (!selected || streaming) return;
    setStreaming(true); setError("");
    const stream = new EventSource(`${API}/api/video/frames/${selected.id}/ocr-stream`);
    stream.addEventListener("segment", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as VideoSegment;
      setSegments((current) => [...current.filter((part) => part.id !== next.id), next].sort((a, b) => a.segment_index - b.segment_index));
    });
    stream.addEventListener("complete", () => { stream.close(); setStreaming(false); loadFrames(); });
    stream.addEventListener("error", (event) => {
      const message = (event as MessageEvent).data ? JSON.parse((event as MessageEvent).data).error : "OCR stream disconnected";
      setError(message); stream.close(); setStreaming(false);
    });
  }

  async function verify() {
    if (!selected || consolidating) return;
    setConsolidating(true); setError("");
    try {
      const result = await postJSON<{ markdown: string; frame: VideoFrame }>(`/api/video/frames/${selected.id}/verify`, {});
      setSelected({ ...selected, ...result.frame, status: "reviewed", formatted_markdown: result.markdown });
      loadFrames();
    } catch {
      setError("Couldn’t consolidate this board. Check that the local vision model is running.");
    } finally { setConsolidating(false); }
  }

  return (
    <PageShell title="Video Review" subtitle="Stable lecture-board frames are saved for your approval. OCR streams crop by crop; approved boards become timestamped RAG sources.">
      {frames.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-sm text-muted">Upload a lecture video in Files. Stable board states will appear here after transcription.</div> : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3">
            {frames.map((frame) => <button key={frame.id} onClick={() => choose(frame)} className={`w-full overflow-hidden rounded-2xl border text-left transition ${selected?.id === frame.id ? "border-brand ring-2 ring-brand/15" : "border-line bg-white hover:border-brand/40"}`}>
              <img className="aspect-video w-full object-cover" src={`${API}${frame.image_url}`} alt={`Board at ${timestamp(frame.timestamp)}`} />
              <div className="p-3"><div className="truncate text-sm font-semibold">{frame.title ?? frame.filename}</div><div className="mt-1 flex justify-between text-xs text-muted"><span>@ {timestamp(frame.timestamp)}</span><span>{frame.status === "reviewed" ? "Indexed" : "Review needed"}</span></div></div>
            </button>)}
          </aside>
          <section className="min-w-0 rounded-2xl border border-line bg-white p-5">
            {!selected ? <p className="py-20 text-center text-sm text-muted">Choose a captured board frame to review it.</p> : <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{selected.title ?? selected.filename}</h2><p className="text-xs text-muted">Captured at {timestamp(selected.timestamp)} — review the full image before indexing.</p></div><a href={`${API}${selected.video_url}#t=${Math.floor(selected.timestamp)}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"><Play className="h-4 w-4" /> Open video</a></div>
              <img className="max-h-[520px] w-full rounded-xl bg-page object-contain" src={`${API}${selected.image_url}`} alt="Full board capture" />
              {selected.status !== "reviewed" && <div className="mt-4 flex flex-wrap gap-3"><button onClick={startStreaming} disabled={streaming} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{streaming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{streaming ? "Reading crops…" : segments.length ? "Re-run crop OCR" : "Read board in small pieces"}</button><button onClick={verify} disabled={consolidating || streaming || segments.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand disabled:opacity-50">{consolidating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{consolidating ? "Reconciling full image…" : "I checked it — consolidate & index"}</button></div>}
              {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
              {selected.formatted_markdown && <div className="prose prose-sm mt-6 max-w-none rounded-xl bg-page p-5"><ReactMarkdown>{selected.formatted_markdown}</ReactMarkdown></div>}
              {segments.length > 0 && <div className="mt-6"><h3 className="mb-3 font-semibold">Progressive OCR results</h3><div className="grid gap-3 sm:grid-cols-2">{segments.map((segment) => <article key={segment.id} className="overflow-hidden rounded-xl border border-line"><img src={`${API}${segment.crop_url}`} className="h-24 w-full object-cover" alt={`Board crop ${segment.segment_index + 1}`} /><div className="p-3 text-sm whitespace-pre-wrap">{segment.raw_text || <span className="text-muted">Reading crop…</span>}{segment.table_markdown && <div className="mt-3 flex gap-2 border-t border-line pt-2 text-xs text-muted"><Table2 className="h-4 w-4 shrink-0" />Table detected; included in final reconciliation.</div>}</div></article>)}</div></div>}
            </>}
          </section>
        </div>
      )}
    </PageShell>
  );
}
