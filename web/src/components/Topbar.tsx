"use client";

import { Menu, Moon, Search, ShieldCheck, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/api";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const preferred = localStorage.getItem("study-buddy-theme") === "dark"
      || (!localStorage.getItem("study-buddy-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = preferred ? "dark" : "light";
  }, []);

  useEffect(() => {
    const check = () => getJSON<{ ok: boolean }>("/api/health")
      .then((result) => setOnline(result.ok))
      .catch(() => setOnline(false));
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("study-buddy-theme", next ? "dark" : "light");
  }

  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center gap-3 bg-page/82 px-4 backdrop-blur-xl sm:px-6 xl:px-5">
      <button onClick={onMenu} className="rounded-xl p-2 text-muted hover:bg-panel hover:text-ink xl:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative max-w-[620px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          aria-label="Search your workspace"
          placeholder="Search notes, files, or ask a question…"
          onKeyDown={(event) => {
            const value = event.currentTarget.value.trim();
            if (event.key === "Enter" && value) router.push(`/search?q=${encodeURIComponent(value)}`);
          }}
          className="h-11 w-full rounded-2xl border border-line bg-panel/88 pl-10 pr-14 text-[13px] font-medium shadow-[var(--shadow-card)] outline-none placeholder:text-muted/70 focus:border-brand/40 focus:ring-4 focus:ring-brand/8"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-panel-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">⌘ K</kbd>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-line bg-panel px-3 py-2 text-xs font-semibold text-muted shadow-sm md:flex">
          <span className={`h-2 w-2 rounded-full ${online === null ? "bg-amber-400" : online ? "bg-emerald-500" : "bg-red-500"}`} />
          {online === null ? "Connecting" : online ? "Local API ready" : "API offline"}
        </div>
        <button onClick={toggleTheme} className="rounded-xl border border-transparent p-2.5 text-muted hover:border-line hover:bg-panel hover:text-ink" aria-label="Toggle color theme">
          <Moon className="theme-light-icon h-[18px] w-[18px]" />
          <Sun className="theme-dark-icon h-[18px] w-[18px]" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-panel" title="Everything stays on this device">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </div>
      </div>
    </header>
  );
}
