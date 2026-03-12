# SMM — Python Backend (FastAPI)

## Setup

**Requirements:** Python 3.11+

```bash
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy database from legacy app (first-time only)
cp ../smm-app/smm.db ./smm.db
```

## Environment Variables

Create `server/.env`:

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

## Start

```bash
uvicorn main:app --reload --port 8000
```

Interactive API docs: **http://localhost:8000/docs**

---

## API Reference

Base URL: `http://localhost:8000`

### Articles

| Method | Path | Body / Query | Response | Description |
|--------|------|-------------|----------|-------------|
| `GET` | `/api/articles` | — | `Article[]` | All scraped articles |
| `DELETE` | `/api/articles?id=<int>` | — | `{success}` | Delete article |
| `POST` | `/api/articles/discover` | `{url}` | `ArticleLink[]` | Find article links on a website |
| `POST` | `/api/articles/extract` | `{url}` | `Article` | Scrape & save a single article |
| `POST` | `/api/articles/extract-and-plan` | `{url}` | `{article, planItem}` | Scrape + add to content plan |
| `POST` | `/api/articles/manual-and-plan` | `{title, content, url?}` | `{article, planItem}` | Create manual article + add to content plan |

### Content Plan

| Method | Path | Body / Query | Response | Description |
|--------|------|-------------|----------|-------------|
| `GET` | `/api/content-plan` | — | `ContentPlanItem[]` | All plan items (with article data) |
| `POST` | `/api/content-plan` | `{article_id}` | `ContentPlanItem` | Add article to plan |
| `DELETE` | `/api/content-plan?id=<int>` | — | `{success}` | Delete plan item |
| `GET` | `/api/content-plan/{id}` | — | `ContentPlanItem` | Single plan item |
| `PATCH` | `/api/content-plan/{id}` | `UpdateContentPlanRequest` | `ContentPlanItem` | Update item fields |

`UpdateContentPlanRequest` optional fields: `status`, `generated_post`, `research`, `notes`, `scheduled_date`

### Research

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| `POST` | `/api/research` | `{content_plan_id}` | SSE stream | Generate research with Google Search grounding |

SSE event format: `data: {"type": "progress|done|error", "message"?: "...", "item"?: {...}}`

### Generate

| Method | Path | Body | Response | Description |
|--------|------|------|----------|-------------|
| `POST` | `/api/generate` | `{content_plan_id, tone}` | `ContentPlanItem` | Generate LinkedIn post |

`tone` values: `value` \| `opinion` \| `story` \| `discussion` \| `insight`

### Settings

| Method | Path | Body / Query | Response | Description |
|--------|------|-------------|----------|-------------|
| `GET` | `/api/settings` | — | `{profile, examplePosts}` | Author profile + example posts |
| `PATCH` | `/api/settings` | `UpdateProfileRequest` | `AuthorProfile` | Update profile |
| `POST` | `/api/settings` | `{content}` | `ExamplePost` | Add example post |
| `DELETE` | `/api/settings?id=<int>` | — | `{success}` | Delete example post |

`UpdateProfileRequest` optional fields: `name`, `expertise`, `tone`, `about`, `avoid_words`

### Sources

| Method | Path | Body / Query | Response | Description |
|--------|------|-------------|----------|-------------|
| `GET` | `/api/sources` | — | `Source[]` | All source URLs |
| `POST` | `/api/sources` | `{url}` | `Source` | Add source URL |
| `DELETE` | `/api/sources?id=<int>` | — | `{success}` | Delete source |

### Stats

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| `GET` | `/api/stats` | `{totalArticles, totalPlanned, totalPublished, totalDraft}` | Dashboard statistics |

---

## Database Schema

File: `server/smm.db` (SQLite)

### `sources`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| url | TEXT UNIQUE | Source website URL |
| name | TEXT | Hostname (auto-extracted) |
| created_at | DATETIME | Default: now |

### `articles`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| url | TEXT UNIQUE | Original article URL |
| title | TEXT | Extracted title |
| content | TEXT | Extracted body text (max 15 000 chars) |
| image_url | TEXT \| NULL | OG image |
| source | TEXT | Hostname |
| created_at | DATETIME | Default: now |

### `content_plan`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| article_id | INTEGER FK | → articles(id) ON DELETE CASCADE |
| status | TEXT | `draft` \| `in_progress` \| `published` |
| generated_post | TEXT \| NULL | AI-generated LinkedIn post |
| research | TEXT \| NULL | AI research findings |
| notes | TEXT \| NULL | User notes |
| scheduled_date | DATE \| NULL | Planned publish date |
| created_at | DATETIME | Default: now |

### `author_profile`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Always 1 (singleton) |
| name | TEXT | Author name |
| expertise | TEXT | Area of expertise |
| tone | TEXT | Preferred writing tone |
| about | TEXT | Bio used in AI prompts |
| avoid_words | TEXT | Comma-separated words to avoid |

### `example_posts`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| content | TEXT | LinkedIn post example |
| created_at | DATETIME | Default: now |

### `domain_profiles`
AI-learned CSS selectors for article content extraction, keyed by domain hostname.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| domain | TEXT UNIQUE | Hostname without `www.` (e.g. `example.com`) |
| selector | TEXT | CSS selector for the main article body (used in scrape_article) |
| feed_selector | TEXT \| NULL | CSS selector for article card containers (used in discover_article_links) |
| sample_url | TEXT \| NULL | URL used when the selector was discovered |
| created_at | DATETIME | Default: now |
| updated_at | DATETIME | Updated on each re-analysis |

**How it works:**
**`selector`** (article body, used by `scrape_article`):
1. First scrape of a new domain: normal heuristics run. If successful, Gemini analyzes in **background** and saves selector.
2. Subsequent scrapes: saved selector used as **Priority 0**.
3. All heuristics fail: Gemini runs **synchronously**, saves selector, retries.
4. Domains in hardcoded `_SITE_SELECTORS` bypass this system.

**`feed_selector`** (article cards, used by `discover_article_links`):
1. First discovery on a new domain: heuristics run. If successful, Gemini learns the feed card selector in **background**.
2. Subsequent discoveries: saved feed selector used as **Priority 0**.
3. Heuristics find nothing: Gemini runs **synchronously** to find the feed selector.

---

## Project Structure

```
server/
├── main.py              # FastAPI app, CORS, router registration
├── requirements.txt
├── .env                 # GEMINI_API_KEY (not committed)
├── smm.db               # SQLite database
├── models/
│   └── schemas.py       # Pydantic request/response models
├── services/
│   ├── db.py            # All SQLite operations
│   ├── gemini.py        # Google Gemini AI (research + post generation)
│   └── scraper.py       # Web scraping (httpx + BeautifulSoup)
└── routers/
    ├── articles.py      # /api/articles*
    ├── content_plan.py  # /api/content-plan*
    ├── research.py      # /api/research (SSE)
    ├── generate.py      # /api/generate
    ├── settings.py      # /api/settings
    ├── sources.py       # /api/sources
    └── stats.py         # /api/stats
```
