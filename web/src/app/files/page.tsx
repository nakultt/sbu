"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Cog, Hourglass, Mic, RotateCcw, Square, UploadCloud } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, Item, RetryResult, timeAgo } from "@/lib/api";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Hourglass className="h-4 w-4 text-amber-500" />,
  processing: <Cog className="h-4 w-4 animate-spin text-blue-500" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <CircleAlert className="h-4 w-4 text-red-500" />,
};

interface RecordedAudio {
  blob: Blob;
  url: string;
  extension: string;
}

interface UploadResult {
  queued: number;
  capture_date: string;
}

function recordingFormat() {
  const formats = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  return formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
}

function elapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export default function FilesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [captureText, setCaptureText] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [retryingItem, setRetryingItem] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    return getJSON<Item[]>("/api/items").then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  async function upload(files: FileList | File[], text = "") {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("text", text);
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${API}/api/upload`);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100));
        };
        request.onload = () => {
            if (request.status >= 200 && request.status < 300) {
                resolve(JSON.parse(request.responseText));
            } else {
                reject(new Error(JSON.parse(request.responseText || "{}").detail || `Upload failed (${request.status})`));
            }
        };
        request.onerror = () => reject(new Error("Could not reach the Study Buddy API"));
        request.send(form);
      });
      setUploadProgress(100);
      refresh();
      return result;
    } finally {
      setUploading(false);
    }
  }

  function chooseFiles(files: FileList | File[]) {
    setSelectedFiles(Array.from(files));
    setCaptureMessage("");
  }

  async function saveCapture() {
    if (!selectedFiles.length && !captureText.trim()) return;
    setCaptureMessage("");
    try {
      const result = await upload(selectedFiles, captureText.trim());
      setCaptureMessage(
        `Added ${result.queued} capture${result.queued === 1 ? "" : "s"} with citation date ${result.capture_date}.`,
      );
      setSelectedFiles([]);
      setCaptureText("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setCaptureMessage(error instanceof Error ? error.message : "Could not save this capture.");
    }
  }

  function discardRecording() {
    if (recordedAudio) URL.revokeObjectURL(recordedAudio.url);
    setRecordedAudio(null);
    setRecordingSeconds(0);
    setRecordingError("");
  }

  async function startRecording() {
    discardRecording();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("This browser does not support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const format = recordingFormat();
      const recorder = new MediaRecorder(stream, format ? { mimeType: format.mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const extension = format?.extension ?? (blob.type.includes("mp4") ? "m4a" : "webm");
        setRecordedAudio({ blob, extension, url: URL.createObjectURL(blob) });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecordingError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : "Could not start the microphone. Check that it is connected and available.",
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setIsRecording(false);
  }

  async function saveRecording() {
    if (!recordedAudio) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File(
      [recordedAudio.blob],
      `live-recording-${stamp}.${recordedAudio.extension}`,
      { type: recordedAudio.blob.type },
    );
    try {
      await upload([file]);
      discardRecording();
    } catch {
      setRecordingError("The recording could not be saved. Please try again.");
    }
  }

  async function retryItem(item: Item) {
    setRetryingItem(item.id);
    setUploadError("");
    try {
      const response = await fetch(`${API}/api/items/${item.id}/retry`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not retry this item");
      const result = body as RetryResult;
      setCaptureMessage(
        result.recovered === "vector_index"
          ? `Repaired the search index for “${item.title ?? item.filename}”.`
          : `Queued “${item.title ?? item.filename}” for processing again.`,
      );
      await refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not retry this item");
    } finally {
      setRetryingItem(null);
    }
  }

  return (
    <PageShell title="Files" subtitle="Everything you capture or upload, processed locally.">
      <div className="mb-5 surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            isRecording ? "animate-pulse bg-red-100" : "bg-chip-purple"
          }`}>
            <Mic className={`h-6 w-6 ${isRecording ? "text-red-500" : "text-brand"}`} />
          </span>
          <div className="min-w-48 flex-1">
            <h2 className="text-sm font-semibold">Record a lecture or voice note</h2>
            <p className="text-xs text-muted">
              {isRecording
                ? `Recording ${elapsedTime(recordingSeconds)} — keep this page open.`
                : recordedAudio
                  ? "Recording ready. Preview it, then save it for transcription."
                  : "Use your laptop microphone and turn the recording into study notes."}
            </p>
          </div>
          {!isRecording && !recordedAudio && (
            <button
              onClick={startRecording}
              className="button-primary"
            >
              <Mic className="h-4 w-4" /> Start recording
            </button>
          )}
          {isRecording && (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop recording
            </button>
          )}
        </div>
        {recordedAudio && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <audio controls src={recordedAudio.url} className="h-10 min-w-60 flex-1" />
            <button
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" /> Record again
            </button>
            <button
              onClick={saveRecording}
              disabled={uploading}
              className="button-primary disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" /> {uploading ? "Saving…" : "Save & process"}
            </button>
          </div>
        )}
        {recordingError && <p className="mt-3 text-sm text-red-500" role="alert">{recordingError}</p>}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFiles(e.dataTransfer.files); }}
        className="surface p-5"
      >
        <div
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
            dragging ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chip-purple">
            <UploadCloud className="h-5 w-5 text-brand" />
          </span>
          <div className="text-sm font-semibold">
            {uploading ? `Uploading… ${uploadProgress}%` :
              (selectedFiles.length
                ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
                : "Drop files here or click to choose")}
          </div>
          <div className="max-w-full truncate px-4 text-xs text-muted">
            {selectedFiles.length
              ? selectedFiles.map((file) => file.name).join(" · ")
              : "audio · video · pdf · images · text"}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && chooseFiles(e.target.files)}
          />
        </div>
        <label className="mt-4 block text-sm font-semibold" htmlFor="capture-text">
          Text or file context
        </label>
        <textarea
          id="capture-text"
          value={captureText}
          onChange={(event) => { setCaptureText(event.target.value); setCaptureMessage(""); }}
          rows={4}
          placeholder={'Write or paste notes here, or describe the files — e.g. “Yesterday\'s biology notes from the cell division lecture.”'}
          className="mt-2 w-full resize-y rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand/40"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Text alone is saved as study material. With files, it becomes their context. Dates mentioned here are used in citations.
          </p>
          <div className="flex items-center gap-2">
            {selectedFiles.length > 0 && (
              <button onClick={() => setSelectedFiles([])} className="px-3 py-2 text-sm text-muted">
                Clear files
              </button>
            )}
            <button
              onClick={saveCapture}
              disabled={uploading || (!selectedFiles.length && !captureText.trim())}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {uploading ? "Adding…" : "Add to library"}
            </button>
          </div>
        </div>
        {captureMessage && <p className="mt-3 text-sm text-muted" role="status">{captureMessage}</p>}
      </div>
      {uploadError && <p className="mt-3 text-sm text-red-500">{uploadError}</p>}

      <h2 className="mb-3 mt-8 font-semibold">Processing queue</h2>
      <div className="overflow-hidden surface">
        {items.length === 0 && <p className="p-5 text-sm text-muted">No files yet.</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
            {STATUS_ICON[it.status] ?? null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{it.title ?? it.filename}</div>
              <div className="truncate text-xs text-muted">
                {it.kind} · {it.capture_date ?? timeAgo(it.created_at)}
                {it.subject ? ` · ${it.subject}` : ""}
                {it.metadata_text ? ` · ${it.metadata_text}` : ""}
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
            {it.status === "error" && (
              <button
                type="button"
                onClick={() => retryItem(it)}
                disabled={retryingItem === it.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${retryingItem === it.id ? "animate-spin" : ""}`} />
                {retryingItem === it.id ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
