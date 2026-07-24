"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import { getJSON } from "@/lib/api";

export default function SettingsPage() {
  const [health, setHealth] = useState<{ ok: boolean; llm: boolean } | null>(null);
  useEffect(() => {
    getJSON<{ ok: boolean; llm: boolean }>("/api/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  const rows = [
    ["Backend API", health ? "Connected" : "Unreachable — run `uvicorn server:app`"],
    ["LM Studio", health?.llm ? "Connected" : "Not reachable — start the LM Studio server"],
    ["Speech-to-text", "Moonshine base (local)"],
    ["Embeddings", "all-MiniLM-L6-v2 (local)"],
    ["Text-to-speech", "Kokoro 82M (local)"],
    ["Storage", "SQLite + LanceDB in ./data"],
  ] as const;

  return (
    <PageShell title="Settings" subtitle="Model and storage configuration lives in the project .env file.">
      <div className="max-w-xl overflow-hidden rounded-2xl border border-line bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-line px-5 py-3.5 text-sm last:border-0">
            <span className="font-medium">{k}</span>
            <span className="text-muted">{v}</span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
