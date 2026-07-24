import CalendarWidget from "@/components/CalendarWidget";
import PageShell from "@/components/PageShell";

export default function CalendarPage() {
  return (
    <PageShell title="Calendar" subtitle="Scheduling is coming soon — for now, a month view.">
      <div className="max-w-md">
        <CalendarWidget />
      </div>
    </PageShell>
  );
}
