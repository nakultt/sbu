# Study Buddy backend

The Python backend contains the FastAPI service, background ingestion pipeline,
portable notes, persistent chat, flashcards, Google Calendar integration,
Telegram UI, handwriting recognition, video-board review, local model
integrations, Streamlit fallback UI, and macOS menu-bar capture app.

From this directory:

```bash
uv venv --python 3.12 .venv
uv pip install -p .venv -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn server:app --port 8010
```

Run the smoke check with:

```bash
.venv/bin/python scripts/smoke.py
```

Run the test suite with:

```bash
.venv/bin/python -m unittest discover -s tests
```
