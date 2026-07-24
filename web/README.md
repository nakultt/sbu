# Study Buddy web

The responsive Next.js 16 workspace for Study Buddy. It uses React 19,
TypeScript, Tailwind CSS v4, Framer Motion, Manrope for interface copy, and
Space Grotesk for display type.

The App Router pages cover the dashboard, files and capture, notes, cited
search, tasks, flashcards, handwriting review, video-board review, audiobooks,
question-paper generation, Google Calendar, and settings.

## Development

From the repository root, start the frontend with one command:

```bash
make frontend
```

The first run installs dependencies when needed. Open
[http://localhost:3000](http://localhost:3000). The API is expected at port 8010
by default; set `STUDY_BUDDY_API_URL` to override it. `FRONTEND_HOST` and
`FRONTEND_PORT` control the development server bind address.

## Calendar

The Calendar page connects Google OAuth, renders monthly Google events, and
shows schedules extracted from uploaded notes, screenshots, and other source
material.

Selecting **Reschedule** asks the backend for a current conflict plan. Plans
with no complex consequences are applied immediately. Cross-day moves, large
cascades, and fixed or attendee conflicts are displayed with their proposed
old and new times before confirmation. Blocked plans explain which event must
be handled in Google Calendar before planning again.

The frontend never computes scheduling policy itself; it renders and confirms
the backend's persisted plan so web and future clients share the same rules.

## Question papers

The Question papers page lets users select one or more notes, choose difficulty
and duration, and configure the number of MCQ, short-answer, and long-answer
questions. It displays calculated marks before generation, stores completed
papers, toggles the answer key in place, and downloads separate print-ready PDF
files for students and answer keys. Generation is queued in the backend and polled
from the page, so long local-model runs continue if the user navigates away and
cannot fail because of an HTTP proxy timeout.

## Checks

```bash
bun --cwd web run lint
bun --cwd web run build
```
