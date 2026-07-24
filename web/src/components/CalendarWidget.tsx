"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  all_day: boolean;
  html_link: string | null;
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CalendarWidget({
  month,
  events = [],
  onMonthChange,
}: {
  month?: Date;
  events?: GoogleCalendarEvent[];
  onMonthChange?: (month: Date) => void;
} = {}) {
  const now = new Date();
  const [localMonth, setLocalMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const visibleMonth = month ?? localMonth;
  const changeMonth = onMonthChange ?? setLocalMonth;
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const last = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay()));

  const cells: Date[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    cells.push(new Date(cursor));
  }
  const eventCounts = events.reduce<Record<string, number>>((counts, event) => {
    const key = event.all_day ? event.start.slice(0, 10) : dateKey(new Date(event.start));
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold">
          {visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => changeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-muted hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => changeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-muted hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center text-sm">
        {DAYS.map((day, index) => (
          <div key={index} className="text-xs font-medium text-muted">{day}</div>
        ))}
        {cells.map((cell) => {
          const current = cell.getMonth() === visibleMonth.getMonth();
          const today = dateKey(cell) === dateKey(now);
          const count = eventCounts[dateKey(cell)] ?? 0;
          return (
            <div key={dateKey(cell)} className="flex justify-center py-0.5">
              <span
                className={`relative flex h-9 w-9 items-center justify-center rounded-full ${
                  today
                    ? "bg-brand font-semibold text-white"
                    : current
                      ? "text-ink"
                      : "text-muted/50"
                }`}
                title={count ? `${count} Google Calendar event${count === 1 ? "" : "s"}` : undefined}
              >
                {cell.getDate()}
                {count > 0 && (
                  <span className={`absolute bottom-0.5 h-1.5 w-1.5 rounded-full ${today ? "bg-panel" : "bg-brand"}`} />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
