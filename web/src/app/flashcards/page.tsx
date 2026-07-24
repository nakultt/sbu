"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, Layers, RotateCcw, Trash2,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import { API, getJSON } from "@/lib/api";

interface Source { label: string; item_id: number; note_id: number | null }
interface Card { id: number; front: string; back: string; position: number }
interface DeckSummary {
  id: number;
  title: string;
  topic: string;
  subject: string | null;
  sources: Source[];
  card_count: number;
  created_at: number;
}
interface Deck extends DeckSummary { cards: Card[] }

export default function FlashcardsPage() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function openDeck(deckId: number) {
    setLoading(true);
    setError("");
    try {
      const selected = await getJSON<Deck>(`/api/flashcards/${deckId}`);
      setDeck(selected);
      setCardIndex(0);
      setShowBack(false);
    } catch {
      setError("Couldn’t load this deck.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDecks() {
    setLoading(true);
    setError("");
    try {
      const saved = await getJSON<DeckSummary[]>("/api/flashcards");
      setDecks(saved);
      if (saved.length) {
        await openDeck(saved[0].id);
      } else {
        setDeck(null);
        setLoading(false);
      }
    } catch {
      setError("Couldn’t load your flashcards. Is the Study Buddy API running?");
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getJSON<DeckSummary[]>("/api/flashcards")
      .then(async (saved) => {
        const selected = saved.length
          ? await getJSON<Deck>(`/api/flashcards/${saved[0].id}`)
          : null;
        if (!active) return;
        setDecks(saved);
        setDeck(selected);
        setCardIndex(0);
        setShowBack(false);
      })
      .catch(() => {
        if (active) setError("Couldn’t load your flashcards. Is the Study Buddy API running?");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function move(offset: number) {
    if (!deck?.cards.length) return;
    setCardIndex((index) => (index + offset + deck.cards.length) % deck.cards.length);
    setShowBack(false);
  }

  async function deleteDeck() {
    if (!deck || !window.confirm(`Delete “${deck.title}”?`)) return;
    await fetch(`${API}/api/flashcards/${deck.id}`, { method: "DELETE" });
    await loadDecks();
  }

  const card = deck?.cards[cardIndex];

  return (
    <PageShell title="Flashcards" subtitle="Decks created from your chat requests.">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && decks.length === 0 ? (
        <div className="flex max-w-2xl flex-col items-center gap-3 surface px-8 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-chip-green">
            <Layers className="h-7 w-7 text-emerald-500" />
          </span>
          <h2 className="font-semibold">No flashcard decks yet</h2>
          <p className="max-w-md text-sm text-muted">
            Ask Study Buddy to create one and it will show up here automatically.
          </p>
          <Link
            href="/search?q=Create%2010%20flashcards%20about%20photosynthesis"
            className="mt-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            Create flashcards in chat
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="overflow-hidden surface">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">Your decks</div>
            <div className="max-h-[65vh] overflow-y-auto">
              {decks.map((saved) => (
                <button
                  key={saved.id}
                  onClick={() => openDeck(saved.id)}
                  className={`block w-full border-b border-line px-4 py-3 text-left last:border-0 ${deck?.id === saved.id ? "bg-brand-soft" : "hover:bg-panel-muted"}`}
                >
                  <span className="line-clamp-2 text-sm font-semibold">{saved.title}</span>
                  <span className="mt-1 block text-xs text-muted">{saved.card_count} cards</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="surface p-5 sm:p-7">
            {loading || !deck || !card ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-muted">Loading deck…</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-600">
                      <BookOpen className="h-4 w-4" /> {deck.card_count} cards
                    </div>
                    <h2 className="mt-1 text-xl font-bold">{deck.title}</h2>
                    <p className="mt-1 text-sm text-muted">Topic: {deck.topic}</p>
                  </div>
                  <button
                    onClick={deleteDeck}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted hover:text-red-500"
                    aria-label="Delete deck"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <button
                  onClick={() => setShowBack((visible) => !visible)}
                  className="mt-7 flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-line bg-page px-8 py-12 text-center transition-colors hover:border-brand/30"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                    {showBack ? "Answer" : "Question"}
                  </span>
                  <span className="mt-5 max-w-2xl text-xl font-semibold leading-relaxed sm:text-2xl">
                    {showBack ? card.back : card.front}
                  </span>
                  <span className="mt-8 text-xs text-muted">Click the card to {showBack ? "see the question" : "reveal the answer"}</span>
                </button>

                <div className="mt-5 flex items-center justify-center gap-4">
                  <button onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-line" aria-label="Previous card">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => setShowBack(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted" aria-label="Show question">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <span className="min-w-16 text-center text-sm font-medium">{cardIndex + 1} / {deck.cards.length}</span>
                  <button onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white" aria-label="Next card">
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
