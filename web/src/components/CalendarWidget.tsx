"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function CalendarWidget() {
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const prevMonthDays = new Date(month.getFullYear(), month.getMonth(), 0).getDate();

  const cells: { day: number; current: boolean }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - startOffset + 1, current: false });

  const isToday = (d: number, current: boolean) =>
    current &&
    d === now.getDate() &&
    month.getMonth() === now.getMonth() &&
    month.getFullYear() === now.getFullYear();

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-page"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded-lg p-1.5 text-muted hover:bg-page"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center text-sm">
        {DAYS.map((d, i) => (
          <div key={i} className="text-xs font-medium text-muted">{d}</div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className="flex justify-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                isToday(c.day, c.current)
                  ? "bg-brand font-semibold text-white"
                  : c.current
                    ? "text-ink"
                    : "text-muted/50"
              }`}
            >
              {c.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
