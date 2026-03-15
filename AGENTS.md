# SMM Project — Rules for Codex

## Project Structure

```
smm 3/
├── client/   — Next.js frontend (React, no API logic)
├── server/   — Python FastAPI backend (all business logic)
└── smm-app/  — Legacy (deprecated, do not modify)
```

## Documentation Rules

These rules are MANDATORY. Never skip them.

### Backend (`server/`)
- **Every new API endpoint** must be added to `server/README.md` in the API Reference table (method, path, request body, response shape).
- **Any change to an existing endpoint** (renamed fields, new params, changed behavior) must update `server/README.md`.
- **Any DB schema change** (new table, new column, changed type) must update the Database Schema section in `server/README.md`.
- **New Python service functions** must have a docstring.

### Frontend (`client/`)
- **Every new page** must be added to the Pages section of `client/README.md` with which API endpoints it uses.
- **Every new environment variable** must be documented in the Environment Variables section of `client/README.md`.
- **Any change to how a page calls the backend** must be reflected in `client/README.md`.

### General
- Both READMEs must always be up to date. Before completing any task, verify that documentation reflects the actual code.
- Do not leave documentation stale. A stale README is as bad as no README.

## Architecture Rules

- **No business logic in the frontend.** The `client/` may only contain UI components, pages, and fetch calls to `server/`. Never import DB, AI, or scraping libraries in the client.
- **All API calls from the frontend** must use the `apiUrl()` helper from `client/src/lib/api.ts`. Never hardcode `http://localhost:8000`.
- **Python server** uses FastAPI. Do not introduce a second web framework.
- **Database** is SQLite (`server/smm.db`). All queries go through `server/services/db.py`.

## Development

Start both services:
```bash
# Terminal 1 — Backend
cd server
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd client
npm run dev
```

API docs auto-generated at: http://localhost:8000/docs

## Design System Rules

All UI must use CSS design tokens. **Never use raw Tailwind color names** unless explicitly listed as allowed.

### Color Tokens (defined in `client/src/app/globals.css`)

| Token | Value | Usage |
|---|---|---|
| `bg-primary` / `text-primary` / `border-primary` | `#8b5cf6` | Violet accent: buttons, links, icons, active states |
| `text-primary-foreground` | `#ffffff` | Text on primary background |
| `bg-background` | `#09090b` | Page backgrounds |
| `bg-card` | `#111113` | Card surfaces |
| `text-foreground` | `#fafafa` | Primary text |
| `text-muted-foreground` | `#a1a1aa` | Secondary text |
| `bg-secondary` | `#27272a` | Secondary buttons, tabs |
| `border-border` | `#27272a` | Element borders |
| `text-destructive` / `bg-destructive` | `#ef4444` | Errors, delete actions |
| `ring` | `#8b5cf6` | Focus ring |

### Status Tokens (inline style only — not Tailwind)

```tsx
// Чернетка
style={{ background: 'var(--status-draft-bg)', color: 'var(--status-draft)' }}
// В роботі
style={{ background: 'var(--status-progress-bg)', color: 'var(--status-progress)' }}
// Опубліковано
style={{ background: 'var(--status-published-bg)', color: 'var(--status-published)' }}
```

### FORBIDDEN — Never use these

```
❌ text-blue-* / bg-blue-* / border-blue-*
❌ text-zinc-* / bg-zinc-* (except inside LinkedIn mock: bg-[#0a0a0a] context)
❌ text-cyan-* / bg-cyan-*
❌ text-rose-* / bg-rose-*
❌ bg-emerald-* / text-emerald-* (use status tokens instead)
❌ Hardcoded hex in className (allowed exceptions: #0a0a0a, #0A66C2 in LinkedIn card only)
```

### Allowed exceptions (LinkedIn card only in `content-plan/[id]/page.tsx`)

The LinkedIn post preview card uses `bg-[#0a0a0a]` and `zinc-*` classes intentionally to simulate the real LinkedIn UI. Do not change these.
