"use client";

import { useEffect, useState } from "react";
import {
  Bot, CheckCircle2, CircleAlert, Database, HardDrive, Mic2, Server,
  ShieldCheck, Volume2,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import { getJSON } from "@/lib/api";

interface Health {
  ok: boolean;
  llm: boolean;
  storage?: boolean;
  version?: string;
}

const SYSTEMS = [
  { label: "Speech to text", value: "Moonshine base", detail: "Lecture transcription", icon: Mic2 },
  { label: "Embeddings", value: "MiniLM L6 v2", detail: "Semantic note search", icon: Database },
  { label: "Text to speech", value: "Kokoro 82M", detail: "Audiobook generation", icon: Volume2 },
  { label: "Local storage", value: "SQLite + LanceDB", detail: "Stored in ./data", icon: HardDrive },
];

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getJSON<Health>("/api/health")
      .then((result) => { setHealth(result); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);

  return (
    <PageShell title="System & privacy" subtitle="A clear view of the local services that power your workspace. Model and storage configuration remains in the project .env file." eyebrow="Settings">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="space-y-5">
          <section className="surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${failed ? "bg-red-50 text-red-500" : health ? "bg-chip-green text-emerald-600" : "bg-chip-orange text-amber-600"}`}>
                  {failed ? <CircleAlert className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                </span>
                <div>
                  <h2 className="text-sm font-bold">Study Buddy API</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {failed ? "Unreachable — start the backend with uvicorn server:app." : health ? "Connected and ready on this device." : "Checking the local service…"}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${failed ? "bg-red-50 text-red-600" : health ? "bg-chip-green text-emerald-700" : "bg-chip-orange text-amber-700"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-red-500" : health ? "bg-emerald-500" : "bg-amber-500"}`} />
                {failed ? "Offline" : health ? `Online${health.version ? ` · v${health.version}` : ""}` : "Connecting"}
              </span>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {SYSTEMS.map(({ label, value, detail, icon: Icon }) => (
              <div key={label} className="surface p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-panel-muted text-brand"><Icon className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-medium text-muted">{label}</p>
                    <p className="mt-0.5 text-sm font-bold">{value}</p>
                    <p className="mt-1 text-[11px] text-muted">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="surface p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chip-purple text-brand"><Bot className="h-5 w-5" /></span>
              <div><h2 className="text-sm font-bold">LM Studio</h2><p className="text-xs text-muted">Local language model</p></div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-panel-muted px-3 py-2.5 text-xs font-semibold">
              {health?.llm ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <CircleAlert className="h-4 w-4 text-amber-500" />}
              {health?.llm ? "Model server connected" : "Start LM Studio to enable AI features"}
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] bg-ink p-5 text-panel">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="mt-4 text-base font-bold">Private by default</h2>
            <p className="mt-2 text-xs leading-5 text-panel/65">Notes, recordings, model calls, and search indexes stay on your local machine.</p>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
