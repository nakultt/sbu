# Study Buddy web

The responsive Next.js workspace for Study Buddy. It uses Tailwind CSS v4,
Framer Motion, Manrope for interface copy, and Space Grotesk for display type.

## Development

From the repository root, start the frontend with one command:

```bash
make frontend
```

The first run installs dependencies when needed. Open
[http://localhost:3000](http://localhost:3000). The API is expected at port 8010
by default; set `STUDY_BUDDY_API_URL` to override it. `FRONTEND_HOST` and
`FRONTEND_PORT` control the development server bind address.

## Checks

```bash
bun --cwd web run lint
bun --cwd web run build
```
