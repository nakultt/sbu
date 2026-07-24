"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react";
import CalendarWidget, { GoogleCalendarEvent } from "@/components/CalendarWidget";
import PageShell from "@/components/PageShell";
import { API, getJSON } from "@/lib/api";

interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  oauth_error: string | null;
  reminders: { pending: number; proposed: number; created: number };
}

interface CalendarProposal {
  id: number; title: string; event_date: string; start_time: string | null; description: string | null; filename: string;
}

function oauthErrorMessage(reason: string) {
  if (reason === "redirect_uri_mismatch") return "Google rejected the callback URL. Add the displayed localhost callback in Google Cloud OAuth settings.";
  if (reason === "invalid_client") return "Google rejected the OAuth client credentials. Rotate the client secret and update the local .env file.";
  if (reason === "invalid_grant") return "The Google authorization expired. Click Connect and approve access again.";
  if (reason === "scope_mismatch") return "Google returned additional account scopes. The app has adjusted for this; click Connect again.";
  return "Google could not complete OAuth. Click Connect and try again.";
}

function eventTime(event: GoogleCalendarEvent) {
  if (event.all_day) return "All day";
  return new Date(event.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [proposals, setProposals] = useState<CalendarProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadEvents = useCallback(async (visibleMonth: Date) => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const end = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    const query = new URLSearchParams({ time_min: start.toISOString(), time_max: end.toISOString() });
    setEvents(await getJSON<GoogleCalendarEvent[]>(`/api/calendar/google/events?${query}`));
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const nextStatus = await getJSON<CalendarStatus>("/api/calendar/google/status");
      setStatus(nextStatus);
      setProposals(await getJSON<CalendarProposal[]>("/api/calendar/proposals"));
      if (!nextStatus.connected && nextStatus.oauth_error) {
        setMessage(oauthErrorMessage(nextStatus.oauth_error));
      }
      if (nextStatus.connected) await loadEvents(month);
      else setEvents([]);
    } catch {
      setMessage("Could not reach the calendar service.");
    } finally {
      setBusy(false);
    }
  }, [loadEvents, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    // Note/file processing happens in the background. Poll only the small local
    // proposal endpoint so newly detected dates appear without a page reload.
    const timer = window.setInterval(() => {
      getJSON<CalendarProposal[]>("/api/calendar/proposals").then(setProposals).catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function decideProposal(id: number, decision: "approve" | "dismiss") {
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/calendar/proposals/${id}/${decision}`, { method: "POST" });
      if (!response.ok) throw new Error();
      setMessage(decision === "approve" ? "Event added to Google Calendar." : "Suggestion dismissed.");
      await refresh();
    } catch {
      setMessage(decision === "approve" ? "Connect Google Calendar before adding this event." : "Could not update this suggestion.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    const messages: Record<string, string> = {
      connected: "Google Calendar connected.",
      denied: "Google Calendar permission was not granted.",
      error: "Google Calendar connection failed. Check the OAuth configuration.",
    };
    const timer = window.setTimeout(() => {
      if (result && messages[result]) setMessage(messages[result]);
    }, 0);
    if (result) window.history.replaceState({}, "", "/calendar");
    return () => window.clearTimeout(timer);
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const result = await getJSON<{ url: string }>("/api/calendar/google/auth-url");
      window.location.href = result.url;
    } catch {
      setMessage("Google OAuth credentials are not configured correctly.");
      setBusy(false);
    }
  }

  async function syncAndRefresh() {
    setBusy(true);
    try {
      await fetch(`${API}/api/calendar/google/sync`, { method: "POST" });
      await refresh();
      setMessage("Calendar events and approved reminders are up to date.");
    } catch {
      setMessage("Could not sync approved reminders.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(`${API}/api/calendar/google`, { method: "DELETE" });
      setStatus((current) => current ? { ...current, connected: false } : current);
      setEvents([]);
      setMessage("Google Calendar disconnected.");
    } finally {
      setBusy(false);
    }
  }

  async function changeMonth(nextMonth: Date) {
    setMonth(nextMonth);
    if (status?.connected) {
      setBusy(true);
      try { await loadEvents(nextMonth); }
      finally { setBusy(false); }
    }
  }

  return (
    <PageShell title="Calendar" subtitle="Your Google Calendar events alongside your Study Buddy workspace.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip-purple">
            <CalendarDays className="h-5 w-5 text-brand" />
          </span>
          <div>
            <div className="text-sm font-semibold">Google Calendar</div>
            <div className="text-xs text-muted">
              {status?.connected
                ? "Connected · events require your approval"
                : status?.configured
                  ? "Ready to connect"
                  : "OAuth credentials need configuration"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {status?.connected && (
            <button onClick={syncAndRefresh} disabled={busy} className="rounded-xl border border-line p-2.5 text-muted" aria-label="Sync events and reminders">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </button>
          )}
          {status?.connected ? (
            <button onClick={disconnect} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium">
              <Unlink className="h-4 w-4" /> Disconnect
            </button>
          ) : (
            <button onClick={connect} disabled={busy || !status?.configured} className="button-primary disabled:opacity-50">
              <Link2 className="h-4 w-4" /> Connect Google Calendar
            </button>
          )}
        </div>
      </div>
      {message && <p className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 text-sm" role="status">{message}</p>}
      {status?.connected && status.reminders.pending > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {status.reminders.pending} approved reminder{status.reminders.pending === 1 ? " is" : "s are"} waiting to sync.
        </p>
      )}
      {proposals.length > 0 && (
        <section className="mb-5 rounded-2xl border border-brand/20 bg-chip-purple p-4">
          <h2 className="text-sm font-semibold">Calendar suggestions</h2>
          <p className="mt-1 text-xs text-muted">Dates found in your study materials are never added automatically. Review each one.</p>
          <div className="mt-3 space-y-3">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel px-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{proposal.title}</div>
                  <div className="text-xs text-muted">{new Date(`${proposal.event_date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}{proposal.start_time ? ` · ${proposal.start_time}` : " · All day"} · from {proposal.filename}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void decideProposal(proposal.id, "approve")} disabled={busy || !status?.connected} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add to Google</button>
                  <button onClick={() => void decideProposal(proposal.id, "dismiss")} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
          {!status?.connected && <p className="mt-3 text-xs text-muted">Connect Google Calendar to approve a suggestion.</p>}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <CalendarWidget month={month} events={events} onMonthChange={changeMonth} />
        <div className="overflow-hidden surface">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Events this month</div>
          {!status?.connected && <p className="p-4 text-sm text-muted">Connect Google Calendar to see your schedule.</p>}
          {status?.connected && !busy && events.length === 0 && <p className="p-4 text-sm text-muted">No events this month.</p>}
          {events.map((event) => (
            <div key={event.id} className="border-b border-line px-4 py-3 last:border-0">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{event.summary}</div>
                  <div className="text-xs text-muted">
                    {new Date(event.start).toLocaleDateString([], { month: "short", day: "numeric" })} · {eventTime(event)}
                    {event.location ? ` · ${event.location}` : ""}
                  </div>
                </div>
                {event.html_link && (
                  <a href={event.html_link} target="_blank" rel="noreferrer" className="text-muted hover:text-brand" aria-label={`Open ${event.summary} in Google Calendar`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
