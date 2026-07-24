# Study Buddy backend

The Python backend is the common API and processing runtime for both the web
dashboard and mobile clients. It contains the FastAPI service, background ingestion pipeline,
editable portable notes, extracted figures, persistent chat, flashcards,
Google Calendar integration, Telegram UI, handwriting recognition, video-board
review, local model integrations, Streamlit fallback UI, and macOS menu-bar
capture app.

From the repository root, setup dependencies as described in the main README,
then start the API and ingestion worker with one command:

```bash
make backend
```

The first run creates `backend/.venv` and installs the locked dependencies from
`pyproject.toml` and `uv.lock`. On macOS this command also starts the 📚 menu-bar capture app. When a
`TELEGRAM_BOT_TOKEN` is configured, it starts the Telegram polling bot as well.
The package runtime supervises optional clients, FastAPI owns one ingestion
worker, and all processes stop together. Set `STUDY_BUDDY_MENUBAR=0` or
`STUDY_BUDDY_TELEGRAM=0` to disable either optional interface.

The API listens on port 8010 by default:

- API discovery: `http://127.0.0.1:8010/api`
- Interactive docs: `http://127.0.0.1:8010/api/docs`
- OpenAPI contract: `http://127.0.0.1:8010/api/openapi.json`
- Liveness: `http://127.0.0.1:8010/api/health/live`
- Readiness: `http://127.0.0.1:8010/api/health/ready`

Every response includes `X-Request-ID`, `X-Process-Time-Ms`, and
`X-API-Version`. Send an existing `X-Request-ID` to correlate client and server
logs.

Run the smoke check with:

```bash
make backend-smoke
```

Run the test suite with:

```bash
make backend-test
```

For production, set `APP_ENV=production`, `LOG_FORMAT=json`, explicit
`TRUSTED_HOSTS`, explicit `CORS_ORIGINS`, and the proxy addresses allowed to set
forwarding headers in `FORWARDED_ALLOW_IPS`.
