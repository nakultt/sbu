"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Mic, Play, SendHorizonal, Sparkles, Square, Trash2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import VideoModal from "@/components/VideoModal";
import { API, getJSON, postJSON } from "@/lib/api";

interface Subject { id: number; name: string }
interface CitationSource { label: string; item_id: number; note_id: number | null; timestamp?: number | null }
interface VideoSource { item_id: number; timestamp: number; label: string }
interface ImageSource { chunk_id: number; item_id: number; timestamp: number | null; label: string; url: string }

interface AskResult {
    answer: string;
    sources: CitationSource[];
    images: ImageSource[];
    videos: VideoSource[];
    deck_id?: number | null;
    transcript?: string;
}

interface Turn {
  id?: number;
  role: "user" | "assistant";
  content: string;
  sources?: CitationSource[];
  videos?: VideoSource[];
  images?: ImageSource[];
  created_at?: number;
}

function historyTime(timestamp?: number) {
  if (!timestamp) return "Just now";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Server turns carry a unique id; an optimistic (not-yet-saved) turn has none.
// Namespacing keeps the id- and index-based keys from ever colliding, which
// previously made React silently drop a freshly-added assistant reply.
function turnKey(turn: Turn, index: number) {
  return turn.id != null ? `id-${turn.id}` : `idx-${index}`;
}

function timestampLabel(timestamp: number) {
  const totalSeconds = Math.floor(timestamp);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function videoHref(video: VideoSource) {
  const totalSeconds = Math.floor(video.timestamp);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `/search?video=${video.item_id}&t=${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function timestampFromSourceLabel(label: string): number | null {
  const match = /@ (?:(\d+):)?(\d+):(\d{2})$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return seconds < 60 ? hours * 3600 + minutes * 60 + seconds : null;
}

function sourceVideo(turn: Turn, source: CitationSource): VideoSource | null {
  if (source.timestamp != null) {
    return { item_id: source.item_id, timestamp: source.timestamp, label: source.label };
  }
  const savedVideo = turn.videos?.find((video) =>
    video.item_id === source.item_id && source.label.endsWith(`@ ${timestampLabel(video.timestamp)}`)
  );
  if (savedVideo) return savedVideo;
  const timestamp = timestampFromSourceLabel(source.label);
  return timestamp == null ? null : { item_id: source.item_id, timestamp, label: source.label };
}

function speechRecordingFormat() {
  const formats = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  return formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
}

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState("");
  const [chat, setChat] = useState<Turn[]>([]);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [busyMessage, setBusyMessage] = useState("Searching your notes…");
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const activeVideo = (() => {
    const itemId = Number(params.get("video"));
    const match = /^(\d+)m(\d{1,2})s$/.exec(params.get("t") ?? "");
    if (!Number.isInteger(itemId) || itemId <= 0 || !match || Number(match[2]) >= 60) return null;
    const timestamp = Number(match[1]) * 60 + Number(match[2]);
    return chat.flatMap((turn) => turn.videos ?? []).find((video) =>
      video.item_id === itemId && Math.floor(video.timestamp) === timestamp
    ) ?? { item_id: itemId, timestamp, label: `Lecture video at ${timestampLabel(timestamp)}` };
  })();

  useEffect(() => {
    getJSON<Subject[]>("/api/subjects").then(setSubjects).catch(() => {});
    getJSON<Turn[]>("/api/chat?limit=200").then(setChat).catch(() => {});
  }, []);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setChat((c) => [...c, { role: "user", content: question }]);
    setBusyMessage(/(?:create|make|generate|build).*flash[\s-]*cards?/i.test(question)
      ? "Creating your flashcards…"
      : "Searching your notes…");
    setBusy(true);
    try {
      const r = await postJSON<AskResult>("/api/ask", {
        question,
        subject: subject || null,
      });
      const saved = await getJSON<Turn[]>("/api/chat?limit=200");
      setChat(saved.length ? saved : (c) => [...c, {
          role: "assistant",
          content: r.answer,
          sources: r.sources,
          videos: r.videos,
          images: r.images
      }]);
    } catch {
      setChat((c) => [...c, {
        role: "assistant",
        content: "Couldn't reach the Study Buddy API — is `uvicorn server:app` running?",
      }]);
    } finally {
      setBusy(false);
    }
  }

  async function submitVoice(blob: Blob, extension: string) {
    const form = new FormData();
    form.append("audio", new File([blob], `spoken-question.${extension}`, { type: blob.type }));
    form.append("subject", subject);
    setSpeechError("");
    setBusyMessage("Transcribing your question, then searching your notes…");
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/ask/audio`, { method: "POST", body: form });
      const raw = await response.text();
      let result: (AskResult & { detail?: string }) | null = null;
      try {
        result = JSON.parse(raw) as AskResult & { detail?: string };
      } catch {
        if (!response.ok) {
          throw new Error(response.status >= 500
            ? "The local voice service failed. Check the backend and LM Studio, then try again."
            : "The voice service returned an unreadable response.");
        }
      }
      if (!response.ok) throw new Error(result?.detail ?? "The voice question could not be processed.");
      if (!result) throw new Error("The voice service returned an empty response.");
      const saved = await getJSON<Turn[]>("/api/chat?limit=200");
      setChat(saved.length ? saved : (current) => [
        ...current,
        { role: "user", content: result.transcript ?? "Spoken question" },
        { role: "assistant", content: result.answer, sources: result.sources, videos: result.videos, images: result.images },
      ]);
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : "The voice question could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (busy || recording) return;
    setSpeechError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSpeechError("This browser does not support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const format = speechRecordingFormat();
      const recorder = new MediaRecorder(stream, format ? { mimeType: format.mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = format?.extension ?? (mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        void submitVoice(blob, extension);
      };
      recorder.start(500);
      setRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setSpeechError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access and try again."
          : "Could not start the microphone. Check that it is available.",
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function clearHistory() {
    await fetch(`${API}/api/chat`, { method: "DELETE" });
    setChat([]);
  }

  return (
    <PageShell title="Ask My Notes" subtitle="Answers grounded in your own material, with citations.">
      <div className="mb-4 flex items-center gap-3">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
        {chat.length > 0 && (
          <button onClick={clearHistory} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-muted">
            <Trash2 className="h-4 w-4" /> Clear history
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="max-h-[65vh] overflow-y-auto surface">
          <div className="sticky top-0 border-b border-line bg-panel px-4 py-3 text-sm font-semibold">Chat history</div>
          {chat.filter((turn) => turn.role === "user").length === 0 ? (
            <p className="p-4 text-sm text-muted">Your previous questions will appear here.</p>
          ) : (
            chat.map((turn, index) => turn.role === "user" && (
              <button
                key={turnKey(turn, index)}
                onClick={() => document.getElementById(`chat-turn-${turnKey(turn, index)}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="block w-full border-b border-line px-4 py-3 text-left last:border-0 hover:bg-panel-muted"
              >
                <span className="line-clamp-2 text-sm font-medium">{turn.content}</span>
                <span className="mt-1 block text-[11px] text-muted">{historyTime(turn.created_at)}</span>
              </button>
            ))
          )}
        </aside>

        <div className="min-h-[45vh] max-h-[65vh] space-y-4 overflow-y-auto surface p-5">
          {chat.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Sparkles className="h-8 w-8 text-brand" />
              <p className="text-sm text-muted">Ask about your notes, or say “Create flashcards about…” to build a study deck.</p>
            </div>
          )}
          {chat.map((t, i) =>
            t.role === "user" ? (
              <div id={`chat-turn-${turnKey(t, i)}`} key={turnKey(t, i)} className="ml-auto max-w-[75%] scroll-mt-4 rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">
                {t.content}
              </div>
            ) : (
              <div key={turnKey(t, i)} className="max-w-[85%] rounded-2xl rounded-bl-md bg-page px-4 py-3 text-sm">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{t.content}</ReactMarkdown>
                </div>

                {t.sources && t.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-line pt-2 text-xs text-muted">
                    <span>Sources:</span>
                    {t.sources.map((source, sourceIndex) => {
                      const video = sourceVideo(t, source);
                      return video ? (
                        <Link key={`${source.item_id}-${sourceIndex}`} href={videoHref(video)} className="text-brand hover:underline">
                          {source.label}
                        </Link>
                      ) : source.note_id ? (
                        <Link key={`${source.item_id}-${sourceIndex}`} href={`/notes?note=${source.note_id}`} className="text-brand hover:underline">
                          {source.label}
                        </Link>
                      ) : (
                        <span key={`${source.item_id}-${sourceIndex}`}>{source.label}</span>
                      );
                    })}
                  </div>
                )}

                {t.videos && t.videos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.videos.map((video) => <Link key={`${video.item_id}-${video.timestamp}`} href={videoHref(video)} className="inline-flex items-center gap-1 rounded-lg bg-panel px-2 py-1 text-xs text-brand"><Play className="h-3 w-3" />Play from {timestampLabel(video.timestamp)}</Link>)}
                  </div>
                )}
                {t.images && t.images.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {t.images.map((picture) => <figure key={picture.chunk_id} className="overflow-hidden rounded-xl border border-line bg-panel"><img src={`${API}${picture.url}`} alt={picture.label} className="max-h-64 w-full object-contain" /><figcaption className="border-t border-line px-3 py-2 text-xs text-muted">{picture.label}{picture.timestamp != null ? ` @ ${Math.floor(picture.timestamp / 60)}:${String(Math.floor(picture.timestamp % 60)).padStart(2, "0")}` : ""}</figcaption></figure>)}
                  </div>
                )}
              </div>
            ),
          )}

          {busy && <div className="text-sm text-muted">{busyMessage}</div>}
          <div ref={bottomRef} />
        </div>
      </div>

      {activeVideo && (
        <VideoModal
          src={`${API}/api/video/items/${activeVideo.item_id}/file`}
          timestamp={activeVideo.timestamp}
          label={activeVideo.label}
          onClose={() => {
            if (params.has("video") || params.has("t")) router.replace("/search", { scroll: false });
          }}
        />
      )}

      <div className="mt-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            disabled={busy || recording}
            placeholder={recording ? "Listening… click stop when you finish" : "Ask about your notes or create flashcards…"}
            className="flex-1 rounded-full border border-line bg-panel px-5 py-3 text-sm outline-none focus:border-brand/40 disabled:opacity-65"
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={busy}
            className={`flex h-12 w-12 items-center justify-center rounded-full border transition disabled:opacity-50 ${
              recording ? "animate-pulse border-red-300 bg-red-500 text-white" : "border-line bg-panel text-brand hover:border-brand/40"
            }`}
            aria-label={recording ? "Stop recording and ask" : "Ask with microphone"}
            title={recording ? "Stop recording and ask" : "Ask with microphone"}
          >
            {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            onClick={() => ask()}
            disabled={busy || recording || !input.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"
            aria-label="Send"
          >
            <SendHorizonal className="h-5 w-5" />
          </button>
        </div>
        {recording && <p className="mt-2 text-center text-xs font-medium text-red-500">Listening… click the stop button when your question is complete.</p>}
        {speechError && <p className="mt-2 text-center text-xs text-red-500" role="alert">{speechError}</p>}
      </div>
    </PageShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
