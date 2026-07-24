"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, Plus, Trash2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON, postJSON } from "@/lib/api";

export interface Task {
  id: number;
  label: string;
  due: string | null;
  done: number;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");
  const [confirmCalendar, setConfirmCalendar] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    getJSON<Task[]>("/api/tasks").then(setTasks).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  async function create(addToCalendar: boolean) {
    if (!label.trim()) return;
    try {
      const result = await postJSON<{ calendar_added: boolean }>("/api/tasks", { label: label.trim(), due: due || null, add_to_calendar: addToCalendar });
      setLabel("");
      setDue("");
      setConfirmCalendar(false);
      setMessage(result.calendar_added ? "Task added to Google Calendar." : "Task added locally.");
      refresh();
    } catch {
      setMessage(addToCalendar ? "The task was saved locally, but could not be added to Google Calendar. Check the Calendar connection and date." : "Could not add the task.");
    }
  }

  function add() {
    if (!label.trim()) return;
    if (due.trim()) setConfirmCalendar(true);
    else void create(false);
  }

  async function toggle(t: Task) {
    await fetch(`${API}/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
    refresh();
  }

  async function remove(id: number) {
    await fetch(`${API}/api/tasks/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <PageShell title="Tasks" subtitle="Plan what matters, keep deadlines visible, and optionally add dated work to Google Calendar." eyebrow="Focus">
      <div className="max-w-3xl surface p-4 sm:p-5">
        {message && <p className="mb-4 rounded-xl bg-chip-purple px-3 py-2 text-sm text-brand" role="status">{message}</p>}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add a task…"
            className="field"
          />
          <input
            value={due}
            onChange={(e) => setDue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Due (e.g. May 18)"
            className="field"
          />
          <button
            onClick={add}
            className="button-primary"
          >
            <Plus className="h-4 w-4" /> Add task
          </button>
        </div>
        <div className="mt-5 space-y-1 border-t border-line pt-4">
          {tasks.length === 0 && <div className="flex flex-col items-center py-8 text-center"><CheckCircle2 className="h-7 w-7 text-muted/50" /><p className="mt-2 text-sm font-semibold">Your list is clear</p><p className="mt-1 text-xs text-muted">Add the next useful thing when it comes up.</p></div>}
          {tasks.map((t) => (
            <div key={t.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-panel-muted">
              <input
                type="checkbox"
                checked={!!t.done}
                onChange={() => toggle(t)}
                className="h-4 w-4 accent-brand"
              />
              <span className={`flex-1 ${t.done ? "text-muted line-through" : ""}`}>{t.label}</span>
              {t.due && <span className="text-xs text-muted">{t.due}</span>}
              <button
                onClick={() => remove(t.id)}
                className="rounded-lg p-1.5 text-muted opacity-60 hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {confirmCalendar && (
        <div className="mt-4 max-w-3xl rounded-2xl border border-brand/20 bg-chip-purple p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><CalendarPlus className="h-4 w-4 text-brand" /> Add this dated task to Google Calendar?</p>
          <p className="mt-1 text-sm text-muted">“{label.trim()}” is due {due.trim()}. Your choice is required before a calendar event is created.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void create(true)} className="button-primary">Yes, add it</button>
            <button onClick={() => void create(false)} className="button-secondary">No, keep local</button>
            <button onClick={() => setConfirmCalendar(false)} className="px-2 text-sm text-muted">Cancel</button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
