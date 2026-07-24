# 📚 Study Buddy

A fully local study workspace for students. Capture lectures, recordings, PDFs,
slides and screenshots; Study Buddy transcribes, OCRs and classifies them into
subjects, generates structured notes, and lets you chat over everything with
citations — or listen to your notes as an audiobook. Nothing leaves your machine.

## Features

- **Overlay buddy** — a menu-bar app for instant capture: region screenshots,
  clipboard text/images, mic recordings, or any file. Everything drops into an
  inbox and is processed in the background.
- **Ingestion pipeline** — audio/video → Silero VAD + Moonshine STT with
  timestamps; PDFs → PyMuPDF (+ Apple Vision OCR for scanned pages); images →
  Apple Vision OCR. The LLM classifies each item into a subject, titles it, and
  writes hierarchical markdown notes with source references.
- **Library** — everything organised by subject, with notes and original files.
- **Ask My Notes** — RAG chat over a LanceDB vector index (all-MiniLM-L6-v2
  embeddings), answering strictly from your material with
  `[source: Lecture @ 12:34]` style citations. Relevant slides/screenshots are
  shown with the answer.
- **Audiobook** — notes are rewritten into a narration script and synthesized
  with Kokoro TTS (82M, runs fine on a laptop).

Designed for a 16GB MacBook Air: every model besides your LM Studio LLM is
lightweight (Moonshine base, MiniLM embeddings, Kokoro 82M, Apple's built-in OCR).

## Requirements

- macOS (the overlay buddy and OCR use macOS APIs)
- Python 3.12 (not 3.13+ — Kokoro requires <3.13; `uv venv --python 3.12` handles it)
- [ffmpeg](https://ffmpeg.org): `brew install ffmpeg`
- Optional: `brew install espeak-ng` (Kokoro fallback for unusual words)
- [LM Studio](https://lmstudio.ai) with a small chat model loaded (e.g. Qwen3 4B)
  and the local server running (default `http://localhost:1234`)

## Setup

```bash
cd backend
uv venv --python 3.12 .venv        # or: python3.12 -m venv .venv
uv pip install -p .venv -r requirements.txt   # or: .venv/bin/pip install -r requirements.txt

cp .env.example .env   # adjust LMSTUDIO_MODEL etc. if needed
```

## Run

```bash
# 1. The API backend (from the project root; also runs the ingestion worker)
cd backend && .venv/bin/uvicorn server:app --port 8010

# 2. In another terminal, the web frontend — http://localhost:3000
cd web && npm install && npm run dev

# 3. In another terminal, the overlay buddy (optional but recommended)
cd backend && .venv/bin/python -m buddy.menubar

# Alternative minimal UI (no Node needed): Streamlit homepage
cd backend && .venv/bin/streamlit run app.py
```

Open http://localhost:8501, drop in a lecture recording or PDF, and watch the
queue on the Upload tab. Once processed, it appears in the Library and becomes
searchable in Ask My Notes.

Quick health check without LM Studio or media files:

```bash
cd backend && .venv/bin/python scripts/smoke.py
```

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `LMSTUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio server |
| `LMSTUDIO_API_KEY` | `lm-studio` | API key (any value for local) |
| `LMSTUDIO_MODEL` | `qwen/qwen3-4b` | Chat model id in LM Studio |
| `STT_MODEL` | `moonshine/base` | Moonshine model |
| `EMBED_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model |
| `KOKORO_VOICE` | `af_heart` | Kokoro voice |
| `DATA_DIR` / `INBOX_DIR` | `data` / `inbox` | Storage locations |

## Layout

```
web/                  Next.js dashboard (Notes / Files / Search / Audiobooks …)
backend/server.py     FastAPI backend for the web frontend (+ ingestion worker)
backend/app.py        Streamlit homepage (Library / Upload / Ask / Audiobook)
backend/buddy/        macOS menu-bar capture app
backend/core/         config, sqlite, LLM client, STT, OCR, embeddings,
                      LanceDB store, ingestion pipeline, RAG, audiobook
backend/data/         originals, app.db, lancedb/, audiobooks/  (gitignored)
backend/inbox/        capture drop-zone                          (gitignored)
mobile/               Android client
```

## Notes & limitations (MVP)

- Single user, single machine; Moonshine STT is English-only.
- Retrieval is vector-only for now (no keyword hybrid / reranker).
- Mock interview module is planned but not included yet.
