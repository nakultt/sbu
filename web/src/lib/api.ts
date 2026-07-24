export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export interface Stats {
  notes: number;
  files: number;
  chunks: number;
  audiobooks: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

export interface NotePreview {
  id: number;
  item_id: number;
  created_at: number;
  title: string | null;
  kind: string;
  subject: string | null;
  preview: string;
}

export interface Item {
  id: number;
  filename: string;
  kind: string;
  status: string;
  error: string | null;
  title: string | null;
  subject: string | null;
  created_at: number;
}

export interface ActivityEvent {
  type: string;
  label: string;
  at: number;
}

export interface Audiobook {
  name: string;
  created_at: number;
  size_mb: number;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export function shortDate(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fmtTime = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${fmtTime}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${fmtTime}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
