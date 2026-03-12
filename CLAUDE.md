# SMM Project — Rules for Claude

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
