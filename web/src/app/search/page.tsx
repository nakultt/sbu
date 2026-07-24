"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { SendHorizonal, Sparkles } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, postJSON } from "@/lib/api";

interface Subject { id: number; name: string }
interface AskResult { answer: string; sources: string[]; images: string[] }
interface Turn { role: "user" | "assistant"; content: string; sources?: string[] }

function SearchInner() {
  const params = useSearchParams();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState("");
  const [chat, setChat] = useState<Turn[]>([]);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getJSON<Subject[]>("/api/subjects").then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setChat((c) => [...c, { role: "user", content: question }]);
    setBusy(true);
    try {
      const r = await postJSON<AskResult>("/api/ask", {
        question,
        subject: subject || null,
      });
      setChat((c) => [...c, { role: "assistant", content: r.answer, sources: r.sources }]);
    } catch {
      setChat((c) => [...c, {
        role: "assistant",
        content: "Couldn't reach the Study Buddy API — is `uvicorn server:app` running?",
      }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="Ask My Notes" subtitle="Answers grounded in your own material, with citations.">
      <div className="mb-4 flex items-center gap-3">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="min-h-[45vh] space-y-4 rounded-2xl border border-line bg-white p-5">
        {chat.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Sparkles className="h-8 w-8 text-brand" />
            <p className="text-sm text-muted">Ask anything about your lectures, PDFs and screenshots.</p>
          </div>
        )}
        {chat.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">
              {t.content}
            </div>
          ) : (
            <div key={i} className="max-w-[85%] rounded-2xl rounded-bl-md bg-page px-4 py-3 text-sm">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{t.content}</ReactMarkdown>
              </div>
              {t.sources && t.sources.length > 0 && (
                <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
                  Sources: {t.sources.join(" · ")}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <div className="text-sm text-muted">Searching your notes…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask anything about your notes…"
          className="flex-1 rounded-full border border-line bg-white px-5 py-3 text-sm outline-none focus:border-brand/40"
        />
        <button
          onClick={() => ask()}
          disabled={busy}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"
          aria-label="Send"
        >
          <SendHorizonal className="h-5 w-5" />
        </button>
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
