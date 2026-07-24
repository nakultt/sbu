import { Layers } from "lucide-react";
import PageShell from "@/components/PageShell";

export default function FlashcardsPage() {
  return (
    <PageShell title="Flashcards" subtitle="Coming soon.">
      <div className="flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-line bg-white py-16">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-chip-green">
          <Layers className="h-7 w-7 text-emerald-500" />
        </span>
        <p className="text-sm text-muted">
          Flashcards will be generated automatically from your notes in a future update.
        </p>
      </div>
    </PageShell>
  );
}
