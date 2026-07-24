"use client";

import { useState } from "react";
import PageShell from "@/components/PageShell";

interface Task { label: string; done: boolean }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([
    { label: "Review research papers", done: false },
    { label: "Prepare presentation", done: false },
    { label: "Update documentation", done: false },
  ]);
  const [input, setInput] = useState("");

  return (
    <PageShell title="Tasks" subtitle="Local task list (stored in this browser for now).">
      <div className="max-w-xl rounded-2xl border border-line bg-white p-5">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                setTasks((t) => [...t, { label: input.trim(), done: false }]);
                setInput("");
              }
            }}
            placeholder="Add a task…"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand/40"
          />
        </div>
        <div className="mt-4 space-y-3">
          {tasks.map((t, i) => (
            <label key={i} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))
                }
                className="h-4 w-4 accent-brand"
              />
              <span className={t.done ? "text-muted line-through" : ""}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
