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
- **Portable notes** — download any note as Markdown, or export every note to a
  JSON backup. Both formats can be imported into Study Buddy on another laptop.
- **Flexible captures** — add files, paste or type text, or combine both so the
  text becomes file context. Dates written as “yesterday,” `YYYY-MM-DD`,
  `DD/MM/YYYY`, or a written date are preserved in generated citations.
- **Google Calendar** — connect a Google account with event-level OAuth access,
  view monthly events, and automatically create calendar reminders for explicit
  upcoming exams, deadlines, meetings, and important dates found in new captures.
- **Ask My Notes** — RAG chat over a LanceDB vector index (all-MiniLM-L6-v2
  embeddings), answering strictly from your material with
  `[source: Lecture @ 12:34]` style citations. Relevant slides/screenshots are
  shown with the answer. Chat history persists in SQLite, and citation links
  open the exact generated note they came from.
- **Chat-created flashcards** — ask to “create flashcards about” any topic to
  generate and save a study deck. Matching notes are used when available, and
  saved decks can be flipped through in the Flashcards workspace.
- **Audiobook** — notes are rewritten into a narration script and synthesized
  with Kokoro TTS (82M, runs fine on a laptop).
- **Handwriting** — capture a handwritten page (via the buddy, upload, or the
  Handwriting tab) and it's recognized automatically: when Apple Vision's
  confidence says "this is handwriting", each line is cropped, zoomed, and sent
  to your LM Studio vision model, which replies with the transcription. Every
  page shows up in the Handwriting tab line by line — corrections you make are
  fed back as vocabulary hints on later pages, so reading your hand keeps
  improving.
- **Video review** — lecture videos keep their timestamped transcript for RAG,
  then sample board states locally. A frame is proposed only after it has stayed
  visually stable; OCR streams one crop at a time, detects likely tables, and
  waits for your approval before the full image and OCR are reconciled into an
  indexed, timestamped board note.
- **Telegram UI** — use the complete workspace from a private Telegram bot:
  capture text, voice messages, video notes, photos, PDFs and files; browse or
  export notes; ask grounded questions; manage tasks and calendar suggestions;
  and generate or play audiobooks without opening the web frontend.

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

The run commands below create and populate their own local dependency
environments. Backend dependencies are locked by `backend/uv.lock`. To
customize the defaults, create the backend configuration once:

```bash
cp backend/.env.example backend/.env
# Adjust backend/.env, including LMSTUDIO_MODEL, if needed.
```

## Run

From the project root, the whole primary application now has one command per
service:

```bash
# Terminal 1 — shared web/mobile API, ingestion, macOS menu bar, and Telegram bot
make backend

# Terminal 2 — Next.js at http://localhost:3000
make frontend
```

`make backend` is the single normal backend startup command. It starts the API,
exactly one ingestion worker, and configured optional clients under one managed
lifecycle. The commands install their service dependencies on the first run. Override the
defaults with `BACKEND_HOST`, `BACKEND_PORT`, `FRONTEND_HOST`, or
`FRONTEND_PORT` when needed. On macOS, `make backend` also launches the 📚
menu-bar capture app. When `TELEGRAM_BOT_TOKEN` is configured, it launches the
Telegram bot too. All processes stop together. Set `STUDY_BUDDY_MENUBAR=0` or
`STUDY_BUDDY_TELEGRAM=0` to disable either optional interface.

Optional standalone clients keep their own commands:

```bash
# Minimal Streamlit UI (no Node needed)
cd backend && .venv/bin/streamlit run app.py
```

Open http://localhost:3000, drop in a lecture recording or PDF, and watch the
queue on the Files page. Once processed, it appears in Notes and becomes
searchable in Ask My Notes. The optional Streamlit UI runs at
http://localhost:8501.

The Next.js dashboard proxies same-origin `/api/*` requests to
`http://127.0.0.1:8010` by default. Set `STUDY_BUDDY_API_URL` before starting
Next.js only when the FastAPI service runs at a different address.

Quick health check without LM Studio or media files:

```bash
make backend-smoke
```

Run the backend test suite with `make backend-test`. API discovery, interactive
documentation, and the shared OpenAPI contract are available at `/api`,
`/api/docs`, and `/api/openapi.json` respectively.

## Configuration (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | Runtime profile: `development`, `test`, or `production` |
| `BACKEND_HOST` / `BACKEND_PORT` | `0.0.0.0` / `8010` | API bind address |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / profile default | Console logs locally, JSON logs in production |
| `TRUSTED_HOSTS` | `*` | Accepted Host headers; explicit values are required in production |
| `CORS_ORIGINS` | local web origins | Comma-separated browser origins; native mobile does not use CORS |
| `MAX_UPLOAD_MB` | `1000` | Per-file API upload limit |
| `LMSTUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio server |
| `LMSTUDIO_API_KEY` | `lm-studio` | API key (any value for local) |
| `LMSTUDIO_MODEL` | `qwen3.5-4b-mlx` | Chat model id in LM Studio; it must exactly match an ID returned by `GET /v1/models` |
| `STT_MODEL` | `moonshine/base` | Moonshine model |
| `EMBED_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model |
| `KOKORO_VOICE` | `af_heart` | Kokoro voice |
| `VISION_MODEL` | same as `LMSTUDIO_MODEL` | Vision model used for handwriting transcription |
| `DATA_DIR` / `INBOX_DIR` | `data` / `inbox` | Storage locations |
| `GOOGLE_CALENDAR_CLIENT_ID` | empty | Google OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | empty | Google OAuth client secret (local `.env` only) |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `http://localhost:8010/api/calendar/google/callback` | OAuth callback; authorize this URI in Google Cloud for a Web client |
| `TELEGRAM_BOT_TOKEN` | empty | Bot token from BotFather; keep it only in the local `.env` |
| `TELEGRAM_ALLOWED_USER_IDS` | empty | Comma-separated Telegram user IDs; the bot is locked until one is set |
| `TELEGRAM_ALLOWED_CHAT_IDS` | empty | Optional additional chat-ID allowlist |
| `TELEGRAM_ALLOW_ALL` | `false` | Explicitly disable the allowlist (not recommended) |
| `TELEGRAM_MAX_UPLOAD_MB` | `20` | Maximum inbound Telegram capture size |

### Telegram setup

1. Create a bot with `@BotFather` (or rotate an exposed token) and put the new
   value in the untracked `.env` as `TELEGRAM_BOT_TOKEN=...`.
2. Start `.venv/bin/python telegram_bot.py`, open the bot, and send `/id`.
3. Add the returned user ID to `.env`, for example
   `TELEGRAM_ALLOWED_USER_IDS=123456789`, then restart the bot.
4. Send `/start`. The inline menu exposes the dashboard, notes, files/capture,
   Ask My Notes, tasks, audiobooks, calendar and settings.

Voice messages (`.ogg`) and circular video notes (`.mp4`) are sent through the
same local ffmpeg → Moonshine transcription and note-generation pipeline as web
uploads. Telegram captions are stored as capture context, including dates such
as “yesterday” or `2026-08-20`. The bot sends a notification when processing
finishes. Google OAuth still needs the FastAPI server running because its local
callback is handled at port 8010.

## Layout

```
web/                      Next.js dashboard
backend/server.py         Shared FastAPI web/mobile API
backend/study_buddy/      Managed runtime, lifecycle entrypoint, and logging
backend/pyproject.toml    Locked Python project definition
backend/telegram_bot.py   Private Telegram UI
backend/app.py            Streamlit fallback UI
backend/buddy/            macOS menu-bar capture app
backend/core/             ingestion, editable notes, figures, RAG, calendar,
                          flashcards, handwriting, video review, and audiobooks
backend/tests/            Backend tests
backend/data/             Local app data                              (gitignored)
backend/inbox/            Capture drop-zone                           (gitignored)
mobile/                   Android client
```

## Notes & limitations (MVP)

- Single user, single machine; Moonshine STT is English-only.
- Retrieval is vector-only for now (no keyword hybrid / reranker).
- Mock interview module is planned but not included yet.
