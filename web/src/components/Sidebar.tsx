"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight, BookOpenText, CalendarDays, CheckSquare, FilePlus2, FileText,
  FolderOpen, HardDrive, Headphones, Layers, PenLine, Search, Settings, Sparkles,
  Video, X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getJSON, Stats } from "@/lib/api";

const GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: Sparkles },
      { href: "/notes", label: "Notes", icon: FileText },
      { href: "/files", label: "Library", icon: FolderOpen },
      { href: "/search", label: "Ask my notes", icon: Search },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/flashcards", label: "Flashcards", icon: Layers },
      { href: "/audiobooks", label: "Audiobooks", icon: Headphones },
      { href: "/handwriting", label: "Handwriting", icon: PenLine },
      { href: "/video", label: "Video review", icon: Video },
    ],
  },
];

function Navigation({ stats, onNavigate }: { stats: Stats | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const pct = stats?.disk_total_gb
    ? Math.min(Math.round((stats.disk_used_gb / stats.disk_total_gb) * 100), 100)
    : 0;

  return (
    <>
      <div className="flex h-[82px] items-center gap-3 px-5">
        <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#8b7cff] via-[#715cff] to-[#b55cff] text-white shadow-[0_10px_28px_rgba(113,92,255,0.38)]">
          <BookOpenText className="h-5 w-5" strokeWidth={2.2} />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" />
        </div>
        <div className="min-w-0">
          <div className="font-display truncate text-[16px] font-bold tracking-[-0.035em] text-white">Study Buddy</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Learning OS</div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/files"
          onClick={onNavigate}
          className="group flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-[13px] font-extrabold text-[#17171f] shadow-[0_10px_28px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 hover:bg-[#f5f2ff]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ece8ff] text-[#6557e8]"><FilePlus2 className="h-4 w-4" /></span>
          <span className="flex-1">New capture</span>
          <ArrowUpRight className="h-4 w-4 text-black/35 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex ? "mt-6" : ""}>
            <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/28">{group.label}</p>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={`group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-[13px] font-bold ${
                      active ? "text-white" : "text-white/52 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="active-navigation"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#6e5cf1] to-[#775bdf] shadow-[0_8px_22px_rgba(92,72,210,0.25)]"
                        transition={{ type: "spring", stiffness: 450, damping: 38 }}
                      />
                    )}
                    <Icon className="relative z-10 h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                    <span className="relative z-10">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/[0.07] p-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-white/74">
              <HardDrive className="h-3.5 w-3.5 text-white/35" /> Local storage
            </span>
            <span className="font-bold text-white/38">{stats ? `${stats.disk_used_gb} GB` : "—"}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#7665f5] to-[#aa65ed]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
          <p className="mt-2 text-[10px] font-medium leading-4 text-white/32">
            {stats ? `${pct}% of ${Math.round(stats.disk_total_gb)} GB used` : "Checking this device…"}
          </p>
        </div>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold ${
            pathname === "/settings" ? "bg-white/10 text-white" : "text-white/48 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <Settings className="h-[17px] w-[17px]" /> Settings
        </Link>
      </div>
    </>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getJSON<Stats>("/api/stats").then(setStats).catch(() => {});
  }, []);

  return (
    <>
      <aside className="sticky top-3 ml-3 hidden h-[calc(100dvh-24px)] w-[258px] shrink-0 flex-col overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#17171f] shadow-[0_20px_60px_rgba(24,22,42,0.18)] xl:flex">
        <Navigation stats={stats} />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] xl:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,292px)] flex-col bg-[#17171f] shadow-[var(--shadow-float)] xl:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <button onClick={onClose} className="absolute right-3 top-4 rounded-xl p-2 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
              <Navigation stats={stats} onNavigate={onClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
