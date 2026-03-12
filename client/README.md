# SMM Client

Next.js frontend for the SMM content planning tool. Requires the Python backend (`../server`) running on port 8000.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the Python backend |

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Pages

### `/` — Dashboard
- Shows stats: total articles, content plan items, sources
- API: `GET /api/stats`

### `/ideas` — Ideas Feed
- Add website URLs as sources; discover articles from them
- Scan all saved sources at once
- Add discovered articles directly to the content plan
- API: `GET/POST/DELETE /api/sources`, `POST /api/articles/discover`, `POST /api/articles/extract-and-plan`

### `/content-plan` — Content Plan
- View all items in the content plan with their status (draft / ready / published)
- Delete items from the plan
- API: `GET /api/content-plan`, `DELETE /api/content-plan?id=`

### `/content-plan/[id]` — Content Plan Editor
- Edit a single content plan item
- Run AI research (streams progress via SSE)
- Generate a LinkedIn post with AI
- Change status, edit post text, add notes
- API: `GET /api/content-plan/:id`, `PATCH /api/content-plan/:id`, `POST /api/research`, `POST /api/generate`

### `/settings` — Settings
- Set author profile (bio, tone, words to avoid)
- Add example LinkedIn posts for style learning
- API: `GET/PATCH/POST/DELETE /api/settings`

## Architecture Notes

- All API calls use the `apiUrl()` helper from `src/lib/api.ts` — never hardcode API URLs.
- No server-side logic lives in this package — it is pure frontend.
- Research streaming uses the browser `ReadableStream` API to consume SSE from the backend.
