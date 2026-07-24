"use client";

import { Bell, ChevronDown, Moon, Search } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Topbar() {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-line bg-page/90 px-7 py-3.5 backdrop-blur">
      <div className="relative max-w-xl flex-1">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          placeholder="Search your knowledge..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              router.push(`/search?q=${encodeURIComponent(e.currentTarget.value)}`);
            }
          }}
          className="w-full rounded-full border border-line bg-white py-2.5 pl-11 pr-14 text-sm outline-none placeholder:text-muted focus:border-brand/40"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">⌘K</kbd>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button className="rounded-full p-2 text-ink/60 hover:bg-white" aria-label="Theme">
          <Moon className="h-5 w-5" />
        </button>
        <button className="relative rounded-full p-2 text-ink/60 hover:bg-white" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-400 text-[10px] font-semibold text-white">
            3
          </span>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
            S
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Sachin A S</div>
            <div className="text-xs text-muted">Local Device</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted" />
        </div>
      </div>
    </header>
  );
}
