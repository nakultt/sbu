# Study Buddy mobile

The Android client uses only live values from the same FastAPI backend as the
web dashboard. It does not contain sample notes, tasks, planner entries,
flashcards, statistics, or canned AI answers.

## Run

Start the complete backend from the repository root:

```bash
make backend
```

Start the web workspace in a second terminal. The mobile parity workspace uses
this responsive application for the web-only workflows:

```bash
make frontend
```

The connection fields are filled on first launch with the current laptop
addresses, `http://100.192.1.162:8010` and
`http://100.192.1.162:3000`. Open **ALL → Laptop connection** in the mobile UI
to enter the laptop's current backend and web URLs. **Save & Connect** applies
the new backend immediately and stores both addresses in Android preferences,
so they survive app restarts and do not require rebuilding the APK.

Build-time properties remain available as initial defaults for managed builds:

```bash
./gradlew assembleDebug -PSTUDY_BUDDY_API_URL=http://192.168.1.20:8010
```

For a physical device, you may configure both initial defaults:

```bash
./gradlew assembleDebug \
  -PSTUDY_BUDDY_API_URL=http://192.168.1.20:8010 \
  -PSTUDY_BUDDY_WEB_URL=http://192.168.1.20:3000
```

The phone and development machine must be on the same network, and the backend
must listen on an address reachable by the phone. Do not use `localhost` on a
physical device because that means the phone itself.

## Communication

`StudyBuddyApi` sends JSON over HTTP to the configured base URL. Every request
has `Accept: application/json` and a generated `X-Request-ID`; writes also use
`Content-Type: application/json`. The client reads the backend's
`X-Request-ID` response header and includes it in visible diagnostics when a
request fails.

The app uses these live endpoints:

| Mobile feature | Backend request |
| --- | --- |
| Home statistics | `GET /api/stats` |
| Notes | `GET /api/notes?limit=200` |
| Home tasks and planner | `GET /api/tasks` |
| Complete/uncomplete task | `PATCH /api/tasks/{id}` |
| Deck list | `GET /api/flashcards` |
| Selected deck and cards | `GET /api/flashcards/{id}` |
| Axiom AI | `POST /api/ask` |

At startup, the independent read requests run concurrently. Selecting a deck
loads that deck from the backend. Task changes are written to the backend and
then reflected in the UI. AI answers come directly from the backend retrieval
flow; failures are shown as errors and never replaced with canned text. The
25-minute focus timer is intentionally on-device state and is not represented
as backend data.

The **ALL** tab provides complete parity with every web route: dashboard,
files/capture, notes, cited search and voice questions, handwriting, video
boards, flashcards, audiobooks, tasks, Google Calendar, and settings. These
screens run the responsive web client inside an app-contained WebView. That client
uses same-origin `/api/*` requests, which Next.js proxies to FastAPI. The
WebView supplies the system file picker, microphone permission, authenticated
downloads, browser history, and external-browser handling for Google OAuth and
other off-site links. It never substitutes local sample data.

API discovery is available at `/api`, and the source-of-truth OpenAPI contract
is `/api/openapi.json`.

## Security

The current backend is a local, single-user service and does not expose an
authentication contract. Development builds therefore connect directly without
an authorization header and allow cleartext HTTP for emulator/LAN use. Before
exposing this API outside a trusted local network, add backend authentication,
HTTPS, and a release network-security policy; the mobile client should then
send the issued access token rather than embedding credentials.

No mobile-specific backend process or route set is required.
