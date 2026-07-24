"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react";
import CalendarWidget, { GoogleCalendarEvent } from "@/components/CalendarWidget";
import { Panel, MonoLabel, GlowButton } from "@/components/ui";
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
    <section className="axscreen" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1120 }}>
      <div>
        <MonoLabel size={11} spacing="0.24em" style={{ color: "var(--accent)", display: "block", marginBottom: 8 }}>
          PLANNER
        </MonoLabel>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 500 }}>Calendar</h1>
        <p style={{ margin: "8px 0 0", color: "var(--dim)", fontSize: 14 }}>
          Your Google Calendar events alongside your Study Buddy workspace.
        </p>
      </div>

      {/* Google connection */}
      <Panel style={{ padding: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <MonoLabel size={11}>GOOGLE CALENDAR</MonoLabel>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
            {status?.connected
              ? "Connected · events require your approval"
              : status?.configured
                ? "Ready to connect"
                : "OAuth credentials need configuration"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {status?.connected && (
            <button onClick={syncAndRefresh} disabled={busy} style={{ border: "1px solid var(--line2)", padding: 10, color: "var(--dim)" }} aria-label="Sync events and reminders">
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </button>
          )}
          {status?.connected ? (
            <GlowButton variant="ghost" onClick={disconnect} disabled={busy}>
              <Unlink className="h-4 w-4" /> DISCONNECT
            </GlowButton>
          ) : (
            <GlowButton onClick={connect} disabled={busy || !status?.configured}>
              <Link2 className="h-4 w-4" /> CONNECT
            </GlowButton>
          )}
        </div>
      </Panel>

      {message && (
        <p role="status" style={{ margin: 0, border: "1px solid var(--line2)", padding: "10px 14px", fontSize: 13, color: "var(--dim)" }}>
          {message}
        </p>
      )}
      {status?.connected && status.reminders.pending > 0 && (
        <p style={{ margin: 0, border: "1px solid #fbbf24", padding: "10px 14px", fontSize: 13, color: "#fbbf24" }}>
          {status.reminders.pending} approved reminder{status.reminders.pending === 1 ? " is" : "s are"} waiting to sync.
        </p>
      )}

      {/* Proposals */}
      {proposals.length > 0 && (
        <Panel accent style={{ padding: 18 }}>
          <MonoLabel style={{ display: "block" }}>CALENDAR SUGGESTIONS</MonoLabel>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--dim)" }}>
            Dates found in your study materials are never added automatically. Review each one.
          </p>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {proposals.map((proposal) => (
              <div key={proposal.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--panel2)", padding: "12px 14px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{proposal.title}</div>
                  <MonoLabel size={9} spacing="0.1em" dim style={{ marginTop: 4, display: "block" }}>
                    {new Date(`${proposal.event_date}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
                    {proposal.start_time ? ` · ${proposal.start_time}` : " · ALL DAY"} · FROM {proposal.filename.toUpperCase()}
                  </MonoLabel>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <GlowButton onClick={() => void decideProposal(proposal.id, "approve")} disabled={busy || !status?.connected} style={{ padding: "8px 12px", fontSize: 10 }}>
                    ADD TO GOOGLE
                  </GlowButton>
                  <GlowButton variant="ghost" onClick={() => void decideProposal(proposal.id, "dismiss")} disabled={busy} style={{ padding: "8px 12px", fontSize: 10 }}>
                    DISMISS
                  </GlowButton>
                </div>
              </div>
            ))}
          </div>
          {!status?.connected && <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--dim)" }}>Connect Google Calendar to approve a suggestion.</p>}
        </Panel>
      )}

      {/* Grid + events */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.8fr)", gap: 20, alignItems: "start" }}>
        <CalendarWidget month={month} events={events} onMonthChange={changeMonth} />
        <Panel>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
            <MonoLabel>EVENTS THIS MONTH</MonoLabel>
          </div>
          {!status?.connected && <p style={{ padding: 16, fontSize: 13, color: "var(--dim)" }}>Connect Google Calendar to see your schedule.</p>}
          {status?.connected && !busy && events.length === 0 && <p style={{ padding: 16, fontSize: 13, color: "var(--dim)" }}>No events this month.</p>}
          {events.map((event) => (
            <div key={event.id} style={{ padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ marginTop: 6, width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.summary}</div>
                  <MonoLabel size={9} spacing="0.1em" dim style={{ marginTop: 3, display: "block" }}>
                    {new Date(event.start).toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase()} · {eventTime(event).toUpperCase()}
                    {event.location ? ` · ${event.location.toUpperCase()}` : ""}
                  </MonoLabel>
                </div>
                {event.html_link && (
                  <a href={event.html_link} target="_blank" rel="noreferrer" style={{ color: "var(--dim)" }} aria-label={`Open ${event.summary} in Google Calendar`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </section>
  );
}
