"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, BookOpen, CalendarDays, FileAudio, FilePlus2, FileText,
  FolderOpen, Headphones, Layers, ListTodo, Mic, Pin, Play, RotateCcw, Search,
  ShieldCheck, SquareCheckBig, StickyNote, Wifi,
} from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";
import {
  ActivityEvent, Audiobook, getJSON, NotePreview, shortDate, Stats, timeAgo,
} from "@/lib/api";

const QUICK_ACTIONS = [
  { label: "New Note", icon: StickyNote, bg: "bg-chip-purple", fg: "text-brand", href: "/notes" },
  { label: "Add File", icon: FilePlus2, bg: "bg-chip-blue", fg: "text-blue-500", href: "/files" },
  { label: "Record Audio", icon: Mic, bg: "bg-chip-green", fg: "text-emerald-500", href: "/files" },
  { label: "New Task", icon: SquareCheckBig, bg: "bg-chip-orange", fg: "text-amber-500", href: "/tasks" },
];

const SCHEDULE = [
  { title: "Team Meeting", tag: "Meeting", time: "10:00 AM - 11:00 AM", bar: "bg-blue-400", chip: "bg-chip-blue text-blue-500" },
  { title: "Project Review", tag: "Work", time: "2:00 PM - 3:00 PM", bar: "bg-emerald-400", chip: "bg-chip-green text-emerald-500" },
  { title: "Study Session", tag: "Personal", time: "7:00 PM - 9:00 PM", bar: "bg-amber-400", chip: "bg-chip-orange text-amber-500" },
];

const TASKS = [
  { label: "Review research papers", due: "Today" },
  { label: "Prepare presentation", due: "May 18" },
  { label: "Update documentation", due: "May 19" },
];

const QUICK_ACCESS = [
  { label: "Search", icon: Search, bg: "bg-chip-purple", fg: "text-brand", href: "/search" },
  { label: "Flashcards", icon: Layers, bg: "bg-chip-green", fg: "text-emerald-500", href: "/flashcards" },
  { label: "Audiobooks", icon: Headphones, bg: "bg-chip-purple", fg: "text-brand", href: "/audiobooks" },
  { label: "All Files", icon: FolderOpen, bg: "bg-chip-orange", fg: "text-amber-500", href: "/files" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);

  useEffect(() => {
    getJSON<Stats>("/api/stats").then(setStats).catch(() => {});
    getJSON<NotePreview[]>("/api/notes?limit=5").then(setNotes).catch(() => {});
    getJSON<ActivityEvent[]>("/api/activity?limit=4").then(setActivity).catch(() => {});
    getJSON<Audiobook[]>("/api/audiobooks").then(setAudiobooks).catch(() => {});
  }, []);

  const statCards = [
    { label: "Notes", sub: "Total notes", value: stats?.notes, icon: FileText, bg: "bg-chip-purple", fg: "text-brand" },
    { label: "Files", sub: "Stored locally", value: stats?.files, icon: FolderOpen, bg: "bg-chip-blue", fg: "text-blue-500" },
    { label: "Flashcards", sub: "Study items", value: stats?.chunks, icon: Layers, bg: "bg-chip-green", fg: "text-emerald-500" },
    { label: "Audiobooks", sub: "Total tracks", value: stats?.audiobooks, icon: Headphones, bg: "bg-chip-purple", fg: "text-brand" },
  ];

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      {/* ---- main column ---- */}
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold">{greeting()}, Sachin! 👋</h1>
            <p className="mt-1 max-w-56 text-sm text-muted">
              Your knowledge hub is ready. All data is stored locally.
            </p>
          </div>
          <div className="flex gap-3">
            {QUICK_ACTIONS.map(({ label, icon: Icon, bg, fg, href }) => (
              <Link
                key={label}
                href={href}
                className={`flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-2xl ${bg} transition-transform hover:-translate-y-0.5`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70">
                  <Icon className={`h-5 w-5 ${fg}`} />
                </span>
                <span className={`text-xs font-semibold ${fg}`}>{label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {statCards.map(({ label, sub, value, icon: Icon, bg, fg }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>
                <Icon className={`h-6 w-6 ${fg}`} />
              </span>
              <div>
                <div className="text-xs text-muted">{label}</div>
                <div className="text-2xl font-bold leading-7">{value ?? "—"}</div>
                <div className="text-xs text-muted">{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[3fr_2fr] gap-4">
          {/* Recent notes */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">Recent Notes</h2>
            <div className="mt-3 divide-y divide-line">
              {notes.length === 0 && (
                <p className="py-6 text-sm text-muted">No notes yet — upload a lecture or PDF to get started.</p>
              )}
              {notes.map((n, i) => (
                <div key={n.id} className="flex gap-3 py-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip-purple">
                    <FileText className="h-4.5 w-4.5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{n.title ?? "Untitled"}</span>
                      {n.subject && (
                        <span className="rounded-md bg-chip-purple px-2 py-0.5 text-[11px] font-medium text-brand">
                          {n.subject}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted">{n.preview}…</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {shortDate(n.created_at)}
                    {i === 0 && <Pin className="h-3.5 w-3.5 text-brand" />}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/notes" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand">
              View all notes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Upcoming schedule (demo data) */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4.5 w-4.5 text-muted" /> Upcoming Schedule
            </h2>
            <div className="mt-4 space-y-5">
              {SCHEDULE.map((e) => (
                <div key={e.title} className="flex gap-3">
                  <span className={`w-1 shrink-0 rounded-full ${e.bar}`} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{e.title}</div>
                    <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${e.chip}`}>
                      {e.tag}
                    </span>
                  </div>
                  <div className="text-xs text-muted">{e.time}</div>
                </div>
              ))}
            </div>
            <Link href="/calendar" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand">
              View calendar <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-[3fr_2fr] gap-4">
          {/* Continue learning */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">Continue Learning</h2>
            {audiobooks.length ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-12 items-center justify-center rounded-lg bg-ink">
                  <BookOpen className="h-6 w-6 text-white/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {audiobooks[0].name.replace(/_\d+\.wav$/, "").replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-muted">Generated audiobook · {audiobooks[0].size_mb} MB</div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-line">
                    <div className="h-1.5 w-1/3 rounded-full bg-brand" />
                  </div>
                </div>
                <Link
                  href="/audiobooks"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white"
                  aria-label="Play"
                >
                  <Play className="h-4.5 w-4.5 fill-white" />
                </Link>
                <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted" aria-label="Rewind 30s">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No audiobooks yet — generate one from your notes on the Audiobooks page.
              </p>
            )}
          </div>

          {/* Quick access */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">Quick Access</h2>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {QUICK_ACCESS.map(({ label, icon: Icon, bg, fg, href }) => (
                <Link key={label} href={href} className="flex flex-col items-center gap-2">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${bg} transition-transform hover:-translate-y-0.5`}>
                    <Icon className={`h-6 w-6 ${fg}`} />
                  </span>
                  <span className="text-xs font-medium text-ink/70">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* footer badges */}
        <div className="grid grid-cols-2 gap-4 pb-2">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip-green">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </span>
            <div>
              <div className="text-sm font-semibold">Your data is safe and private</div>
              <div className="text-xs text-muted">Everything is stored locally on your device</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip-blue">
              <Wifi className="h-5 w-5 text-blue-500" />
            </span>
            <div>
              <div className="text-sm font-semibold">Offline Mode</div>
              <div className="text-xs text-muted">Working completely offline</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- right column ---- */}
      <div className="space-y-4">
        <CalendarWidget />

        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <ListTodo className="h-4.5 w-4.5 text-muted" /> Tasks
            </h2>
            <button className="text-sm font-medium text-brand">+ Add Task</button>
          </div>
          <div className="mt-3 space-y-3">
            {TASKS.map((t) => (
              <label key={t.label} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-line accent-brand" />
                <span className="flex-1">{t.label}</span>
                <span className="text-xs text-muted">{t.due}</span>
              </label>
            ))}
          </div>
          <Link href="/tasks" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
            View all tasks <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Activity className="h-4.5 w-4.5 text-muted" /> Recent Activity
          </h2>
          <div className="mt-4 space-y-4">
            {activity.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
            {activity.map((e, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip-purple">
                  {e.type === "note" ? (
                    <FileText className="h-4 w-4 text-brand" />
                  ) : e.label.match(/\.(wav|mp3|m4a|mp4|mov)/i) ? (
                    <FileAudio className="h-4 w-4 text-brand" />
                  ) : (
                    <FolderOpen className="h-4 w-4 text-brand" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{e.label}</div>
                  <div className="text-xs text-muted">{timeAgo(e.at)}</div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/files" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
            View all activity <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
