"""
Database service — SQLite operations.
All queries go through this module. DB file: server/smm.db
"""

import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "smm.db"

_db: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    """Return a singleton SQLite connection, initialising tables on first call."""
    global _db
    if _db is None:
        _db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode = WAL")
        _db.execute("PRAGMA foreign_keys = ON")
        _init_tables(_db)
    return _db


def _row(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def _rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


def _init_tables(db: sqlite3.Connection) -> None:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            source TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS author_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT DEFAULT '',
            expertise TEXT DEFAULT '',
            tone TEXT DEFAULT '',
            about TEXT DEFAULT '',
            avoid_words TEXT DEFAULT ''
        );

        INSERT OR IGNORE INTO author_profile (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS example_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS content_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            generated_post TEXT,
            research TEXT,
            notes TEXT,
            scheduled_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS domain_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            selector TEXT NOT NULL,
            sample_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Migration: add research column if missing
    cols = [r["name"] for r in db.execute("PRAGMA table_info(content_plan)").fetchall()]
    if "research" not in cols:
        db.execute("ALTER TABLE content_plan ADD COLUMN research TEXT")
    
    # Migration: add gemini_api_key to author_profile if missing
    profile_cols = [r["name"] for r in db.execute("PRAGMA table_info(author_profile)").fetchall()]
    if "gemini_api_key" not in profile_cols:
        db.execute("ALTER TABLE author_profile ADD COLUMN gemini_api_key TEXT DEFAULT ''")
    if "linkedin_client_id" not in profile_cols:
        db.execute("ALTER TABLE author_profile ADD COLUMN linkedin_client_id TEXT DEFAULT ''")
    if "linkedin_client_secret" not in profile_cols:
        db.execute("ALTER TABLE author_profile ADD COLUMN linkedin_client_secret TEXT DEFAULT ''")
    if "linkedin_access_token" not in profile_cols:
        db.execute("ALTER TABLE author_profile ADD COLUMN linkedin_access_token TEXT DEFAULT ''")
    if "linkedin_person_id" not in profile_cols:
        db.execute("ALTER TABLE author_profile ADD COLUMN linkedin_person_id TEXT DEFAULT ''")

    # Migration: add feed_selector to domain_profiles if missing
    dp_cols = [r["name"] for r in db.execute("PRAGMA table_info(domain_profiles)").fetchall()]
    if "feed_selector" not in dp_cols:
        db.execute("ALTER TABLE domain_profiles ADD COLUMN feed_selector TEXT")

    # Migration: add visual content columns to content_plan
    cp_cols = [r["name"] for r in db.execute("PRAGMA table_info(content_plan)").fetchall()]
    if "carousel_url" not in cp_cols:
        db.execute("ALTER TABLE content_plan ADD COLUMN carousel_url TEXT")
    if "cover_image_url" not in cp_cols:
        db.execute("ALTER TABLE content_plan ADD COLUMN cover_image_url TEXT")

    db.commit()


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------

def get_all_articles() -> list[dict]:
    """Return all articles ordered by creation date descending."""
    return _rows(get_db().execute("SELECT * FROM articles ORDER BY created_at DESC").fetchall())


def get_article_by_id(article_id: int) -> dict | None:
    """Return a single article by id, or None."""
    return _row(get_db().execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone())


def get_article_by_url(url: str) -> dict | None:
    """Return a single article by url, or None."""
    return _row(get_db().execute("SELECT * FROM articles WHERE url = ?", (url,)).fetchone())


def insert_article(url: str, title: str, content: str, image_url: str | None, source: str) -> dict:
    """Insert a new article and return the created row."""
    db = get_db()
    cur = db.execute(
        "INSERT INTO articles (url, title, content, image_url, source) VALUES (?, ?, ?, ?, ?)",
        (url, title, content, image_url, source),
    )
    db.commit()
    return _row(db.execute("SELECT * FROM articles WHERE id = ?", (cur.lastrowid,)).fetchone())


def delete_article(article_id: int) -> None:
    """Delete an article by id."""
    db = get_db()
    db.execute("DELETE FROM articles WHERE id = ?", (article_id,))
    db.commit()


# ---------------------------------------------------------------------------
# Content Plan
# ---------------------------------------------------------------------------

_PLAN_JOIN = """
    SELECT cp.*, a.title, a.url, a.content, a.image_url, a.source
    FROM content_plan cp
    JOIN articles a ON cp.article_id = a.id
"""


def get_all_content_plan() -> list[dict]:
    """Return all content plan items with joined article fields."""
    return _rows(get_db().execute(_PLAN_JOIN + " ORDER BY cp.created_at DESC").fetchall())


def get_content_plan_item(item_id: int) -> dict | None:
    """Return a single content plan item with joined article fields, or None."""
    return _row(get_db().execute(_PLAN_JOIN + " WHERE cp.id = ?", (item_id,)).fetchone())


def add_to_content_plan(article_id: int) -> dict:
    """Add an article to the content plan and return the new item."""
    db = get_db()
    cur = db.execute("INSERT INTO content_plan (article_id) VALUES (?)", (article_id,))
    db.commit()
    return get_content_plan_item(cur.lastrowid)


def update_content_plan(item_id: int, data: dict) -> dict:
    """
    Partially update a content plan item.
    Accepted keys: status, generated_post, research, notes, scheduled_date
    """
    allowed = {"status", "generated_post", "research", "notes", "scheduled_date", "carousel_url", "cover_image_url"}
    fields = [(k, v) for k, v in data.items() if k in allowed and v is not None]
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k, _ in fields)
        values = [v for _, v in fields] + [item_id]
        db = get_db()
        db.execute(f"UPDATE content_plan SET {set_clause} WHERE id = ?", values)
        db.commit()
    return get_content_plan_item(item_id)


def delete_content_plan_item(item_id: int) -> None:
    """Delete a content plan item by id."""
    db = get_db()
    db.execute("DELETE FROM content_plan WHERE id = ?", (item_id,))
    db.commit()


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def get_all_sources() -> list[dict]:
    """Return all saved sources ordered by creation date descending."""
    return _rows(get_db().execute("SELECT * FROM sources ORDER BY created_at DESC").fetchall())


def add_source(url: str, name: str) -> dict:
    """Insert a source (ignoring duplicates) and return the row."""
    db = get_db()
    db.execute("INSERT OR IGNORE INTO sources (url, name) VALUES (?, ?)", (url, name))
    db.commit()
    return _row(db.execute("SELECT * FROM sources WHERE url = ?", (url,)).fetchone())


def delete_source(source_id: int) -> None:
    """Delete a source by id."""
    db = get_db()
    db.execute("DELETE FROM sources WHERE id = ?", (source_id,))
    db.commit()


# ---------------------------------------------------------------------------
# Author Profile (singleton row id=1)
# ---------------------------------------------------------------------------

def get_profile() -> dict:
    """Return the author profile."""
    return _row(get_db().execute("SELECT * FROM author_profile WHERE id = 1").fetchone())


def update_profile(data: dict) -> dict:
    """
    Partially update the author profile.
    Accepted keys: name, expertise, tone, about, avoid_words
    """
    allowed = {"name", "expertise", "tone", "about", "avoid_words", "gemini_api_key"}
    fields = [(k, v) for k, v in data.items() if k in allowed]
    if fields:
        set_clause = ", ".join(f"{k} = ?" for k, _ in fields)
        values = [v for _, v in fields]
        db = get_db()
        db.execute(f"UPDATE author_profile SET {set_clause} WHERE id = 1", values)
        db.commit()
    return get_profile()


# ---------------------------------------------------------------------------
# Example Posts
# ---------------------------------------------------------------------------

def get_example_posts() -> list[dict]:
    """Return all example posts ordered by creation date descending."""
    return _rows(get_db().execute("SELECT * FROM example_posts ORDER BY created_at DESC").fetchall())


def add_example_post(content: str) -> dict:
    """Add an example post and return the created row."""
    db = get_db()
    cur = db.execute("INSERT INTO example_posts (content) VALUES (?)", (content,))
    db.commit()
    return _row(db.execute("SELECT * FROM example_posts WHERE id = ?", (cur.lastrowid,)).fetchone())


def delete_example_post(post_id: int) -> None:
    """Delete an example post by id."""
    db = get_db()
    db.execute("DELETE FROM example_posts WHERE id = ?", (post_id,))
    db.commit()


# ---------------------------------------------------------------------------
# Domain Profiles (AI-learned scraping selectors)
# ---------------------------------------------------------------------------

def get_domain_profile(domain: str) -> dict | None:
    """Return the AI-learned scraping profile for a domain, or None."""
    return _row(get_db().execute("SELECT * FROM domain_profiles WHERE domain = ?", (domain,)).fetchone())


def save_domain_profile(domain: str, selector: str, sample_url: str) -> None:
    """Insert or update the AI-learned CSS selector for a domain."""
    db = get_db()
    db.execute(
        """INSERT INTO domain_profiles (domain, selector, sample_url, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(domain) DO UPDATE SET
               selector = excluded.selector,
               sample_url = excluded.sample_url,
               updated_at = CURRENT_TIMESTAMP""",
        (domain, selector, sample_url),
    )
    db.commit()


def save_feed_selector(domain: str, feed_selector: str, sample_url: str) -> None:
    """Insert or update the AI-learned article listing selector for a domain."""
    db = get_db()
    db.execute(
        """INSERT INTO domain_profiles (domain, selector, feed_selector, sample_url, updated_at)
           VALUES (?, '', ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(domain) DO UPDATE SET
               feed_selector = excluded.feed_selector,
               updated_at = CURRENT_TIMESTAMP""",
        (domain, feed_selector, sample_url),
    )
    db.commit()


def get_all_domain_profiles() -> list[dict]:
    """Return all saved domain profiles."""
    return _rows(get_db().execute("SELECT * FROM domain_profiles ORDER BY updated_at DESC").fetchall())


def delete_domain_profile(domain: str) -> None:
    """Delete the scraping profile for a domain (forces AI re-analysis on next scrape)."""
    db = get_db()
    db.execute("DELETE FROM domain_profiles WHERE domain = ?", (domain,))
    db.commit()


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def get_stats() -> dict:
    """Return aggregate statistics for the dashboard."""
    db = get_db()
    total_articles = db.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    total_planned = db.execute("SELECT COUNT(*) FROM content_plan").fetchone()[0]
    total_published = db.execute("SELECT COUNT(*) FROM content_plan WHERE status = 'published'").fetchone()[0]
    total_draft = db.execute("SELECT COUNT(*) FROM content_plan WHERE status = 'draft'").fetchone()[0]
    return {
        "totalArticles": total_articles,
        "totalPlanned": total_planned,
        "totalPublished": total_published,
        "totalDraft": total_draft,
    }
