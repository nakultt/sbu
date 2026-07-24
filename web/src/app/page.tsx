"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight, CalendarDays, FileAudio, FilePlus2, FileText, FolderOpen,
  Headphones, Layers, Mic, Search, ShieldCheck, Sparkles,
} from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";
import {
  ActivityEvent, API, Audiobook, getJSON, NotePreview, shortDate, Stats, timeAgo,
} from "@/lib/api";
import { cleanStudyMarkdown } from "@/lib/markdown";

interface Task {
  id: number;
  label: string;
  due: string | null;
  done: number;
}

const ACTIONS = [
  { label: "Add material", detail: "Files, text, or links", icon: FilePlus2, href: "/files", tone: "bg-chip-blue text-blue-600" },
  { label: "Record lecture", detail: "Capture and transcribe", icon: Mic, href: "/files", tone: "bg-chip-green text-emerald-600" },
  { label: "Ask your notes", detail: "Get cited answers", icon: Search, href: "/search", tone: "bg-chip-purple text-brand" },
  { label: "Study a deck", detail: "Review flashcards", icon: Layers, href: "/flashcards", tone: "bg-chip-orange text-amber-600" },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const } },
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [notes, setNotes] = useState<NotePreview[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.allSettled([
      getJSON<Stats>("/api/stats").then(setStats),
      getJSON<NotePreview[]>("/api/notes?limit=4").then(setNotes),
      getJSON<ActivityEvent[]>("/api/activity?limit=5").then(setActivity),
      getJSON<Audiobook[]>("/api/audiobooks").then(setAudiobooks),
      getJSON<Task[]>("/api/tasks").then(setTasks),
    ]);
  }, []);

  async function toggleTask(task: Task) {
    await fetch(`${API}/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, done: entry.done ? 0 : 1 } : entry));
  }

  const statCards = [
    { label: "Notes", value: stats?.notes, icon: FileText, tone: "bg-chip-purple text-brand" },
    { label: "Materials", value: stats?.files, icon: FolderOpen, tone: "bg-chip-blue text-blue-600" },
    { label: "Flashcards", value: stats?.flashcards, icon: Layers, tone: "bg-chip-green text-emerald-600" },
    { label: "Audio lessons", value: stats?.audiobooks, icon: Headphones, tone: "bg-chip-orange text-amber-600" },
  ];
  const openTasks = tasks.filter((task) => !task.done);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-[1240px] space-y-6"
    >
      <motion.section variants={item} className="relative overflow-hidden rounded-[28px] bg-ink px-5 py-7 text-panel shadow-[var(--shadow-card)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-7rem] left-[38%] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-7">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-panel/12 bg-panel/8 px-3 py-1.5 text-xs font-semibold text-panel/75 backdrop-blur">
              <span className="status-dot" /> Your workspace is private and local
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.045em] text-panel sm:text-4xl">
              {greeting()}. What will you learn today?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-panel/62 sm:text-[15px]">
              Turn lectures and study material into searchable notes, focused tasks, flashcards, and audio lessons.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link href="/files" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-panel px-4 py-2.5 text-sm font-bold text-ink shadow-lg hover:-translate-y-0.5 sm:flex-none">
              <FilePlus2 className="h-4 w-4" /> Add material
            </Link>
            <Link href="/search" className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-panel/16 bg-panel/10 px-4 py-2.5 text-sm font-bold text-panel backdrop-blur hover:bg-panel/15 sm:flex-none">
              <Sparkles className="h-4 w-4" /> Ask Buddy
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section variants={container} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <motion.div key={label} variants={item} className="surface flex items-center gap-3 p-4 sm:p-5">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-xl font-bold tracking-[-0.03em] sm:text-2xl">{value ?? "—"}</div>
              <div className="truncate text-xs font-medium text-muted">{label}</div>
            </div>
          </motion.div>
        ))}
      </motion.section>

      <motion.section variants={item}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-[-0.02em]">Quick start</h2>
          <span className="text-xs text-muted">Everything processes on this device</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIONS.map(({ label, detail, icon: Icon, href, tone }) => (
            <Link key={label} href={href} className="surface surface-interactive group flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{label}</span>
                <span className="block truncate text-xs text-muted">{detail}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          ))}
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.8fr)]">
        <div className="space-y-6">
          <motion.section variants={item} className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-sm font-bold">Recent notes</h2>
                <p className="mt-0.5 text-xs text-muted">Your latest processed material</p>
              </div>
              <Link href="/notes" className="text-xs font-bold text-brand hover:text-brand-dark">View all</Link>
            </div>
            {notes.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <FileText className="mx-auto h-6 w-6 text-muted/60" />
                <p className="mt-2 text-sm font-medium">No notes yet</p>
                <p className="mt-1 text-xs text-muted">Add a lecture, PDF, or text capture to begin.</p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {notes.map((note) => (
                  <Link key={note.id} href={`/notes?note=${note.id}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-panel-muted/70">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chip-purple text-brand">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">{note.title ?? "Untitled note"}</span>
                        {note.subject && <span className="hidden rounded-md bg-panel-muted px-2 py-0.5 text-[10px] font-bold text-muted sm:inline">{note.subject}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{cleanStudyMarkdown(note.preview)}</span>
                    </span>
                    <span className="hidden shrink-0 text-[11px] font-medium text-muted sm:block">{shortDate(note.created_at)}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted/50 group-hover:text-brand" />
                  </Link>
                ))}
              </div>
            )}
          </motion.section>

          <motion.section variants={item} className="grid gap-4 sm:grid-cols-2">
            <div className="surface p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Continue listening</h2>
                <Headphones className="h-4 w-4 text-muted" />
              </div>
              {audiobooks.length ? (
                <Link href="/audiobooks" className="mt-4 flex items-center gap-3 rounded-xl bg-panel-muted p-3 hover:bg-brand-soft">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-panel"><Headphones className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{audiobooks[0].name.replace(/_\d+\.wav$/, "").replaceAll("_", " ")}</span>
                    <span className="text-xs text-muted">{audiobooks[0].size_mb} MB · {timeAgo(audiobooks[0].created_at)}</span>
                  </span>
                </Link>
              ) : <p className="mt-4 text-sm leading-6 text-muted">Turn any note into an audio lesson for learning away from your desk.</p>}
            </div>
            <div className="surface flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip-green text-emerald-600"><ShieldCheck className="h-5 w-5" /></span>
              <div>
                <h2 className="text-sm font-bold">Local by design</h2>
                <p className="mt-1 text-xs leading-5 text-muted">Your study data and AI workflow remain on this device.</p>
              </div>
            </div>
          </motion.section>
        </div>

        <aside className="space-y-6">
          <motion.div variants={item}><CalendarWidget /></motion.div>
          <motion.section variants={item} className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted" /><h2 className="text-sm font-bold">Up next</h2></div>
              <Link href="/tasks" className="text-xs font-bold text-brand">Manage</Link>
            </div>
            <div className="p-4">
              {openTasks.length === 0 ? <p className="py-4 text-center text-xs leading-5 text-muted">Nothing due. Add a task when you are ready.</p> : (
                <div className="space-y-1">
                  {openTasks.slice(0, 4).map((task) => (
                    <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-panel-muted">
                      <input type="checkbox" checked={false} onChange={() => toggleTask(task)} className="mt-0.5 h-4 w-4 rounded accent-brand" />
                      <span className="min-w-0 flex-1 text-sm font-medium leading-5">{task.label}</span>
                      {task.due && <span className="shrink-0 text-[10px] font-semibold text-muted">{task.due}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </motion.section>

          <motion.section variants={item} className="surface p-5">
            <h2 className="text-sm font-bold">Recent activity</h2>
            <div className="mt-4 space-y-4">
              {activity.length === 0 && <p className="text-xs text-muted">New captures and notes will appear here.</p>}
              {activity.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-muted text-brand">
                    {entry.type === "note" ? <FileText className="h-3.5 w-3.5" /> : entry.label.match(/\.(wav|mp3|m4a|mp4|mov)/i) ? <FileAudio className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{entry.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{timeAgo(entry.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        </aside>
      </div>
    </motion.div>
  );
}
