"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain, LayoutDashboard, FileText, FolderOpen, CalendarDays, CheckSquare,
  Layers, Headphones, Search, Settings, CheckCircle2, HardDrive,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getJSON, Stats } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/audiobooks", label: "Audiobooks", icon: Headphones },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    getJSON<Stats>("/api/stats").then(setStats).catch(() => {});
  }, []);
  const pct = stats ? Math.round((stats.disk_used_gb / stats.disk_total_gb) * 100) : 25;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
          <Brain className="h-6 w-6 text-brand" />
        </div>
        <div>
          <div className="text-[17px] font-bold leading-tight">AI Knowledge</div>
          <div className="text-xs text-muted">Offline-First</div>
        </div>
      </div>

      <nav className="mt-1 flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                active
                  ? "border border-brand/20 bg-brand-soft text-brand"
                  : "text-ink/70 hover:bg-page"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 px-4 pb-5">
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip-green">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </span>
            <div>
              <div className="text-sm font-semibold">Synced</div>
              <div className="text-xs text-muted">All changes saved locally</div>
            </div>
          </div>
          <button className="mt-3 w-full rounded-xl border border-line py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-page">
            Sync Now
          </button>
        </div>

        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4 text-muted" /> Local Storage
          </div>
          <div className="mt-3 h-2 rounded-full bg-line">
            <div
              className="h-2 rounded-full bg-brand"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>
              {stats ? `${Math.round(stats.disk_used_gb)} GB / ${Math.round(stats.disk_total_gb)} GB` : "…"}
            </span>
            <span>{pct}% Used</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
