"""
Web scraping service — article discovery and extraction.

Approach:
  - Smart content extraction priority:
      1. AI-learned CSS selector from domain_profiles (cached, no tokens on repeat)
      2. Readability-style scoring (picks the div with most <p> text, like browser reader mode)
      3. Semantic article/main tags
      4. Schema.org articleBody
      5. Common CMS class selectors (WordPress, Ghost, etc.)
      6. Full-page <p> fallback
  - Discovery: AI learns feed selector once per domain; subsequent scans use cached selector (zero AI calls).
    If cached selector returns < 3 results, AI re-learns it automatically.
  - Anti-garbage cleanup: removes nav, ads, widgets, social buttons, cookie banners
"""

import re
import threading
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "uk,en-US;q=0.9,en;q=0.8",
}

_SKIP_PATH = re.compile(
    r"/(tag|tags|category|categories|author|authors|page|search|login|register|signup|sign-up|"
    r"about|contact|contacts|privacy|terms|policy|rules|cookies|cookie|feed|rss|sitemap|"
    r"help|faq|support|advertise|advertising|reklama|career|careers|jobs|vacancy|vacancies|"
    r"partners|partnership|cooperation|offer|oferta|dogovor|agreement|ugoda|umova|"
    r"polityka|politica|pravyla|pravila|404|403|500|logout|profile|account|subscribe|"
    r"newsletter|unsubscribe|confirmation|confirm|reset|password|basket|cart|checkout)",
    re.IGNORECASE,
)

# Titles that indicate non-article pages (in any language)
_SKIP_TITLE = re.compile(
    r"^(privacy|terms|cookie|about us|contact|faq|help|404|403|"
    r"угода|умова|політика|контакти|про нас|допомога|вакансії|реклама|партнери|"
    r"користувацька угода|угода користувача|правила|оферта)$",
    re.IGNORECASE,
)
_SKIP_EXT = re.compile(r"\.(css|js|png|jpg|gif|svg|ico|pdf|zip|webp|woff|ttf)$", re.IGNORECASE)

# Noise class patterns — elements to remove before content extraction
_JUNK_RE = re.compile(
    r"\b(ad|ads|advert|advertisement|banner|sidebar|widget|popup|modal|"
    r"cookie|consent|newsletter|subscribe|social|share|related|comment|"
    r"promo|teaser|footer-widget|breadcrumb|pagination|navigation|menu|"
    r"header|topbar|toolbar)\b",
    re.IGNORECASE,
)

# Content-bearing class patterns
_CONTENT_RE = re.compile(
    r"\b(article|post|content|body|text|entry|story|news|material|"
    r"publication|single|main-content|page-content|rich-text|prose)\b",
    re.IGNORECASE,
)

# Per-site custom selectors (if you add more sites, extend this dict)
_SITE_SELECTORS: dict[str, str] = {
    "itc.ua":            ".post-txt, .entry-content",
    "ain.ua":            ".article__body, .post__body, .entry-content",
    "dou.ua":            ".b-typo, .article-content, .content",
    "wired.com":         "[data-testid='body-inner'], .body__inner-container",
    "medium.com":        "article, .postArticle-content",
    "habr.com":          ".article-formatted-body, .post__body",
    "vc.ru":             ".content-area, .article__text",
    "techcrunch.com":    ".article-content, .entry-content",
    "wordpress.com":     ".entry-content, .post-content",
    "theverge.com":      ".duet--article--article-body-component",
    "nv.ua":             ".article__body, .news-text",
    "bbc.com":           "[data-component='text-block'], .article__body-content",
    "bbc.co.uk":         "[data-component='text-block'], .article__body-content",
}


def _site_selector_for(hostname: str) -> str | None:
    """Return hardcoded CSS selector for known sites. Uses exact domain matching."""
    if hostname in _SITE_SELECTORS:
        return _SITE_SELECTORS[hostname]
    for site, sel in _SITE_SELECTORS.items():
        if hostname.endswith("." + site):  # subdomain: blog.ain.ua → ain.ua
            return sel
    return None


# Hardcoded feed selectors for known sites (article card containers on listing pages)
_SITE_FEED_SELECTORS: dict[str, str] = {
    "itc.ua":        ".block-in-loop",
    "ain.ua":        "article.post, .post-item, .news-item",
    "dou.ua":        ".b-post-list__item, .post-item, li.post",
    "habr.com":      "article.tm-articles-list__item",
    "vc.ru":         "article.content--short",
    "medium.com":    "article",
}


def _site_feed_selector_for(hostname: str) -> str | None:
    """Return hardcoded feed selector for known sites. Uses exact domain matching."""
    if hostname in _SITE_FEED_SELECTORS:
        return _SITE_FEED_SELECTORS[hostname]
    for site, sel in _SITE_FEED_SELECTORS.items():
        if hostname.endswith("." + site):
            return sel
    return None


# Universal fallback selectors, ordered by specificity
_UNIVERSAL_CONTENT_SELECTORS = [
    "[itemprop='articleBody']",
    "[class*='article-body']", "[class*='article__body']",
    "[class*='article-content']", "[class*='article__content']",
    "[class*='post-body']", "[class*='post__body']",
    "[class*='post-content']", "[class*='post__content']",
    "[class*='entry-content']", "[class*='entry-body']",
    "[class*='story-body']", "[class*='story-content']",
    "[class*='content-body']", "[class*='content__body']",
    "[class*='single-content']", "[class*='main-content']",
    "[class*='news-body']", "[class*='news-content']",
    "[class*='text-content']", "[class*='rich-text']",
    "[class*='body-text']", "[class*='body__text']",
    ".prose",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client() -> httpx.Client:
    return httpx.Client(
        headers=HEADERS,
        follow_redirects=True,
        timeout=20,
    )


def _resolve_url(href: str, base: str) -> str | None:
    if not href or href.startswith(("#", "mailto:", "tel:", "data:", "javascript:")):
        return None
    try:
        return urljoin(base, href)
    except Exception:
        return None


def _extract_image(tag: Tag, base_origin: str) -> str | None:
    def resolve(raw: str | None) -> str | None:
        if not raw or str(raw).startswith("data:"):
            return None
        try:
            return urljoin(base_origin, str(raw))
        except Exception:
            return None

    # data-bg lazy-load pattern takes priority over inline <img> (e.g. itc.ua)
    for el in tag.find_all(attrs={"data-bg": True}):
        url = resolve(str(el.get("data-bg", "")))
        if url and not url.endswith((".gif", ".ico", ".svg")):
            return url

    img = tag.find("img")
    if img and isinstance(img, Tag):
        for attr in ("src", "data-src", "data-lazy-src", "data-original", "data-srcset"):
            url = resolve(img.get(attr))
            if url and not url.endswith((".gif", ".ico", ".svg")):
                return url
        srcset = img.get("srcset") or img.get("data-srcset")
        if srcset:
            # Pick the largest image from srcset
            parts = [p.strip().split() for p in str(srcset).split(",") if p.strip()]
            # Sort by width descriptor if available
            try:
                parts.sort(key=lambda p: int(p[1].rstrip("w")) if len(p) > 1 and p[1].endswith("w") else 0, reverse=True)
            except Exception:
                pass
            url = resolve(parts[0][0]) if parts else None
            if url:
                return url

    picture_source = tag.find("source")
    if picture_source and isinstance(picture_source, Tag):
        srcset = picture_source.get("srcset", "")
        if srcset:
            first = str(srcset).split(",")[0].strip().split()[0]
            url = resolve(first)
            if url:
                return url

    for el in tag.find_all(style=True):
        style = el.get("style", "")
        match = re.search(r"url\(['\"]?([^'\")\s]+)['\"]?\)", str(style))
        if match:
            url = resolve(match.group(1))
            if url:
                return url

    return None


def _clean_soup(soup: BeautifulSoup) -> None:
    """Remove noise elements in-place before content extraction."""
    # Remove structural noise
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside",
                               "noscript", "iframe", "form", "button", "figure+figcaption"]):
        tag.decompose()

    # Remove by class/id patterns
    for tag in soup.find_all(True, class_=_JUNK_RE):
        if tag.name not in ("html", "body", "main", "article", "section", "div"):
            tag.decompose()

    for tag in soup.find_all(True, id=_JUNK_RE):
        if tag.name not in ("html", "body", "main", "article", "section", "div"):
            tag.decompose()


def _score_content(tag: Tag) -> int:
    """Score a tag by how much readable text it contains."""
    score = 0
    for p in tag.find_all(["p", "blockquote"]):
        text = p.get_text(strip=True)
        if len(text) > 40:
            score += len(text)
    return score


def _extract_text_from_tag(tag: Tag) -> str:
    """Extract readable text from a given container tag."""
    texts = []
    for el in tag.find_all(["p", "h2", "h3", "h4", "h5", "li", "blockquote"]):
        text = el.get_text(separator=" ", strip=True)
        # Filter out very short or likely navigation/button text
        if len(text) > 25 and not re.match(r"^(читати|далі|більше|share|tweet|like|\d+)\s*$", text, re.I):
            texts.append(text)
    return "\n\n".join(texts)


def _extract_excerpt(container: Tag, title: str) -> str | None:
    """Extract a short preview text from an article card container."""
    _EXCERPT_CLASS = re.compile(
        r"\b(excerpt|desc|description|preview|summary|lead|intro|anons|annotation|teaser|standfirst)\b",
        re.IGNORECASE,
    )
    # 1. Explicit excerpt-class element
    for tag_name in ("p", "div", "span"):
        el = container.find(tag_name, class_=_EXCERPT_CLASS)
        if el and isinstance(el, Tag):
            text = el.get_text(strip=True)
            if 30 <= len(text) <= 400 and text != title:
                return text[:250]

    # 2. First <p> that looks like real text
    for p in container.find_all("p"):
        if not isinstance(p, Tag):
            continue
        text = p.get_text(strip=True)
        if 40 <= len(text) <= 400 and text != title:
            return text[:250]

    # 3. First <span> or <div> with enough text (not a heading/link)
    for tag_name in ("span", "div"):
        for el in container.find_all(tag_name):
            if not isinstance(el, Tag):
                continue
            if el.find(["h1", "h2", "h3", "h4", "a"]):
                continue
            text = el.get_text(strip=True)
            if 50 <= len(text) <= 350 and text != title:
                return text[:250]

    return None


def _readability_extract(soup: BeautifulSoup) -> str:
    """
    Readability-style: score all block-level containers and pick the winner.
    Returns extracted text or empty string.
    """
    candidates: list[tuple[int, Tag]] = []

    for tag in soup.find_all(["article", "main", "section", "div"]):
        if not isinstance(tag, Tag):
            continue
        # Skip elements that are obvious navigation/junk
        cls = " ".join(tag.get("class", []))
        if _JUNK_RE.search(cls):
            continue
        score = _score_content(tag)
        if score > 300:
            candidates.append((score, tag))

    if not candidates:
        return ""

    # Pick the container with highest score
    candidates.sort(key=lambda x: x[0], reverse=True)
    best = candidates[0][1]
    return _extract_text_from_tag(best)


# ---------------------------------------------------------------------------
# AI Domain Profile helpers
# ---------------------------------------------------------------------------

def _build_html_skeleton(soup: BeautifulSoup, max_chars: int = 10000) -> str:
    """
    Build a compact structural snapshot of the page: tag names + class/id + short text.
    Used as input for AI selector discovery without sending the full HTML.
    """
    body = soup.find("body") or soup
    parts: list[str] = []

    def walk(tag: Tag, depth: int) -> None:
        if len("".join(parts)) >= max_chars:
            return
        if not isinstance(tag, Tag):
            return
        if tag.name in ("script", "style", "svg", "noscript", "head"):
            return

        indent = "  " * min(depth, 10)
        cls = " ".join(str(c) for c in tag.get("class", []))[:80]
        tid = str(tag.get("id", ""))[:40]
        attrs = ""
        if cls:
            attrs += f' class="{cls}"'
        if tid:
            attrs += f' id="{tid}"'

        if tag.name in ("p", "h1", "h2", "h3", "h4", "li", "span", "a", "time"):
            text = tag.get_text(strip=True)[:60]
            if tag.name == "a":
                href = str(tag.get("href", ""))[:100]
                if href:
                    attrs += f' href="{href}"'
            parts.append(f"{indent}<{tag.name}{attrs}>{text}\n")
        else:
            parts.append(f"{indent}<{tag.name}{attrs}>\n")
            for child in tag.children:
                if isinstance(child, Tag):
                    walk(child, depth + 1)

    walk(body if isinstance(body, Tag) else soup, 0)
    return "".join(parts)[:max_chars]


def _ai_discover_selector(html_skeleton: str, url: str) -> str | None:
    """
    Ask Gemini to identify the CSS selector for the main article content container.
    Returns a selector string or None if detection failed or no API key.
    """
    try:
        from google import genai as _genai
        from services.db import get_profile

        profile = get_profile()
        api_key = (profile or {}).get("gemini_api_key", "")
        if not api_key:
            return None

        client = _genai.Client(api_key=api_key)
        prompt = (
            f"You are analyzing HTML structure from: {url}\n"
            "Task: find the CSS selector that targets the MAIN article body text container.\n\n"
            "Rules:\n"
            "- The selector must wrap the article paragraphs and headings (the actual article text)\n"
            "- Do NOT select: nav, header, footer, sidebar, ads, comment sections, related articles\n"
            "- Prefer class-based selectors like .article-body or [class*='post__content']\n"
            "- Return a single CSS selector that works with document.querySelector()\n\n"
            f"HTML skeleton:\n{html_skeleton}\n\n"
            "Reply with ONLY the CSS selector string. If you cannot determine one reliably, reply: NONE"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        result = (response.text or "").strip()

        if not result or result.upper() == "NONE" or "\n" in result or len(result) > 200:
            return None
        return result
    except Exception:
        return None




def _extract_links_from_containers(
    containers: list, base_url: str, base_origin: str, seen: set
) -> list[dict]:
    """Extract article link dicts from a list of article card containers."""
    links: list[dict] = []
    parsed_base = urlparse(base_url)

    for container in containers:
        if not isinstance(container, Tag):
            continue

        a_tag = container if container.name == "a" else container.find("a", href=True)
        if not a_tag or not isinstance(a_tag, Tag):
            continue

        href = a_tag.get("href", "")
        full_url = _resolve_url(str(href), base_url)
        if not full_url:
            continue

        parsed = urlparse(full_url)
        if parsed.hostname != parsed_base.hostname:
            continue
        if len(parsed.path) < 5 or _SKIP_PATH.search(parsed.path) or _SKIP_EXT.search(parsed.path):
            continue

        normalized = parsed.scheme + "://" + parsed.netloc + parsed.path.rstrip("/")
        if normalized in seen:
            continue
        seen.add(normalized)

        title_tag = container.find(["h1", "h2", "h3", "h4"])
        title = title_tag.get_text(strip=True) if title_tag else a_tag.get_text(strip=True)
        title = re.sub(r"\s+", " ", title).strip()
        if not (10 <= len(title) <= 350):
            continue
        if _SKIP_TITLE.match(title):
            continue

        image = _extract_image(container, base_origin)
        # If container is an <a> tag itself, the image may be in the parent wrapper
        if not image and container.name == "a" and container.parent and isinstance(container.parent, Tag):
            image = _extract_image(container.parent, base_origin)

        excerpt = _extract_excerpt(container, title)

        links.append({"url": full_url, "title": title[:300], "image": image, "excerpt": excerpt})

    return links


def _save_profile_async(domain: str, html_skeleton: str, url: str) -> None:
    """Spawn a background thread to run AI selector discovery and save the result."""
    def run() -> None:
        try:
            selector = _ai_discover_selector(html_skeleton, url)
            if selector:
                from services.db import save_domain_profile
                save_domain_profile(domain, selector, url)
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()


def _ai_extract_articles(html_skeleton: str, base_url: str) -> tuple[list[dict], str | None]:
    """
    Use Gemini to extract article list from a news/blog listing page AND identify
    the CSS selector for article card containers (for caching on subsequent scans).
    Returns (articles, feed_selector_or_None).
    """
    import json
    try:
        from google import genai as _genai
        from services.db import get_profile

        profile = get_profile()
        api_key = (profile or {}).get("gemini_api_key", "")
        if not api_key:
            return [], None

        client = _genai.Client(api_key=api_key)
        parsed_base = urlparse(base_url)

        prompt = (
            f"Analyze this news/blog listing page: {base_url}\n\n"
            "Return ONLY valid JSON (no markdown, no explanation):\n"
            '{"selector":"CSS_SELECTOR_OR_NULL","articles":[{"url":"...","title":"...","excerpt":"...or null"}]}\n\n'
            "Rules for selector:\n"
            "- CSS selector for the repeating article card containers (e.g. 'article', '.post-card', 'li.news-item')\n"
            "- Each matched container must have one article link + title\n"
            "- Set to null if none is clearly identifiable\n\n"
            "Rules for articles:\n"
            "- Real news/blog articles only (skip nav, ads, terms, contacts, about, social buttons)\n"
            f"- Absolute URLs only. Base: {parsed_base.scheme}://{parsed_base.netloc}\n"
            "- Title: 10-300 chars\n"
            "- Up to 30 items\n\n"
            f"HTML:\n{html_skeleton}"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        text = (response.text or "").strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE).strip()

        data = json.loads(text)
        if not isinstance(data, dict):
            return [], None

        # Extract and validate the feed selector
        raw_sel = data.get("selector")
        feed_selector: str | None = None
        if isinstance(raw_sel, str) and raw_sel.strip() and raw_sel.upper() not in ("NULL", "NONE"):
            sel = raw_sel.strip()
            if "\n" not in sel and len(sel) <= 200:
                feed_selector = sel

        # Extract articles
        articles_data = data.get("articles", [])
        if not isinstance(articles_data, list):
            return [], feed_selector

        result: list[dict] = []
        seen: set[str] = set()

        for item in articles_data:
            if not isinstance(item, dict):
                continue
            raw_url = str(item.get("url", "")).strip()
            full_url = _resolve_url(raw_url, base_url)
            if not full_url:
                continue
            parsed = urlparse(full_url)
            if parsed.hostname != parsed_base.hostname:
                continue
            if _SKIP_PATH.search(parsed.path) or _SKIP_EXT.search(parsed.path):
                continue
            normalized = parsed.scheme + "://" + parsed.netloc + parsed.path.rstrip("/")
            if normalized in seen:
                continue
            seen.add(normalized)

            title = str(item.get("title", "")).strip()
            if not (10 <= len(title) <= 350) or _SKIP_TITLE.match(title):
                continue

            raw_excerpt = item.get("excerpt")
            excerpt = (
                str(raw_excerpt).strip()[:250]
                if raw_excerpt and str(raw_excerpt).strip() not in ("null", "None", "")
                else None
            )

            result.append({"url": full_url, "title": title[:300], "image": None, "excerpt": excerpt})

        return result, feed_selector
    except Exception:
        return [], None


def _enrich_with_images(links: list[dict], soup: BeautifulSoup, base_origin: str) -> None:
    """Find images for AI-extracted articles by matching their URLs on the original page."""
    for link in links:
        if link.get("image"):
            continue
        path = urlparse(link["url"]).path.rstrip("/")
        for a in soup.find_all("a", href=True):
            if not isinstance(a, Tag):
                continue
            href = str(a.get("href", "")).rstrip("/")
            if path not in href:
                continue
            container = a.find_parent(["article", "li", "div", "section"]) or a.parent
            if container and isinstance(container, Tag):
                img = _extract_image(container, base_origin)
                if img:
                    link["image"] = img
                    break


# ---------------------------------------------------------------------------
# Public API — Discovery
# ---------------------------------------------------------------------------

def discover_article_links(url: str) -> list[dict]:
    """
    Fetch a website and return a list of article links found on the page.
    Returns up to 50 items with keys: url, title, image, excerpt.

    Flow:
      1. Hardcoded feed selector for known sites (_SITE_FEED_SELECTORS) — most reliable
      2. AI-learned feed selector from domain_profiles (cached, zero AI tokens)
      3. If no selector or < 3 results: AI extracts directly + learns/updates selector for next time
      4. Heuristic CSS selectors as final fallback (when AI unavailable)
    """
    with _client() as client:
        response = client.get(url)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")
    base_parsed = urlparse(url)
    base_origin = f"{base_parsed.scheme}://{base_parsed.netloc}"
    hostname = (base_parsed.hostname or "").replace("www.", "")

    # Priority 0: Hardcoded feed selector for known sites (most reliable, no AI)
    hardcoded_feed = _site_feed_selector_for(hostname)
    if hardcoded_feed:
        try:
            containers = soup.select(hardcoded_feed)
            seen: set[str] = set()
            links = _extract_links_from_containers(containers, url, base_origin, seen)
            if links:
                return links[:50]
        except Exception:
            pass

    # Priority 1: AI-learned feed selector from domain_profiles (cached, zero AI tokens)
    from services.db import get_domain_profile
    profile = get_domain_profile(hostname)
    if profile and profile.get("feed_selector"):
        try:
            containers = soup.select(profile["feed_selector"])
            seen = set()
            links = _extract_links_from_containers(containers, url, base_origin, seen)
            if len(links) >= 3:
                return links[:50]
        except Exception:
            pass
        # Selector returned < 3 results — re-learn below

    # Priority 1: AI extracts articles directly + learns feed selector in one call
    skeleton = _build_html_skeleton(soup)
    links, feed_selector = _ai_extract_articles(skeleton, url)

    if links:
        _enrich_with_images(links, soup, base_origin)
        if feed_selector:
            from services.db import save_feed_selector
            save_feed_selector(hostname, feed_selector, url)
        return links[:50]

    # Priority 2: Heuristic CSS selector approach (fallback when AI unavailable)
    links = []
    seen: set[str] = set()
    selectors = [
        "article a[href]",
        "a[href] h1", "a[href] h2", "a[href] h3",
        ".post a[href]", ".article a[href]", ".entry a[href]",
        ".card a[href]", ".story a[href]", ".news a[href]",
        "h1 a[href]", "h2 a[href]", "h3 a[href]",
        "[class*='post'] a[href]", "[class*='article'] a[href]", "[class*='blog'] a[href]",
        "[class*='card'] a[href]", "[class*='story'] a[href]", "[class*='news'] a[href]",
        "[class*='material'] a[href]", "[class*='item'] a[href]",
        "a[href][class*='title']", "a[href][class*='link']", "a[href][class*='headline']",
        "li a[href]",
    ]

    for selector in selectors:
        for el in soup.select(selector):
            a_tag = el if el.name == "a" else el.find_parent("a")
            if not a_tag or not isinstance(a_tag, Tag):
                continue
            href = a_tag.get("href")
            full_url = _resolve_url(str(href) if href else "", url)
            if not full_url:
                continue
            parsed = urlparse(full_url)
            if parsed.hostname != base_parsed.hostname:
                continue
            if parsed.path in ("/", "") or len(parsed.path) < 5:
                continue
            if _SKIP_PATH.search(parsed.path) or _SKIP_EXT.search(parsed.path):
                continue
            normalized = parsed.scheme + "://" + parsed.netloc + parsed.path.rstrip("/")
            if normalized in seen:
                continue
            seen.add(normalized)

            title = a_tag.get_text(separator=" ", strip=True) or str(a_tag.get("title", ""))
            title = re.sub(r"\s+", " ", title).strip()
            if not (10 <= len(title) <= 350) or _SKIP_TITLE.match(title):
                continue

            container = (
                a_tag.find_parent(["article", "li"])
                or a_tag.find_parent(attrs={"class": re.compile(r"post|card|article|item|feed|blog|news|material", re.I)})
                or a_tag.parent
            )
            image = _extract_image(container, base_origin) if container else None
            if not image:
                image = _extract_image(a_tag, base_origin)
            excerpt = _extract_excerpt(container, title) if container and isinstance(container, Tag) else None

            links.append({"url": full_url, "title": title[:300], "image": image, "excerpt": excerpt})

    if not links:
        for a_tag in soup.find_all("a", href=True):
            if not isinstance(a_tag, Tag):
                continue
            href = a_tag.get("href")
            full_url = _resolve_url(str(href) if href else "", url)
            if not full_url:
                continue
            parsed = urlparse(full_url)
            if parsed.hostname != base_parsed.hostname:
                continue
            if len(parsed.path) < 10 or _SKIP_EXT.search(parsed.path) or _SKIP_PATH.search(parsed.path):
                continue
            normalized = parsed.scheme + "://" + parsed.netloc + parsed.path.rstrip("/")
            if normalized in seen:
                continue
            seen.add(normalized)
            title = re.sub(r"\s+", " ", a_tag.get_text(strip=True)).strip()
            if not (12 <= len(title) <= 300):
                continue
            links.append({"url": full_url, "title": title, "image": None, "excerpt": None})

    return links[:50]


# ---------------------------------------------------------------------------
# Public API — Extraction
# ---------------------------------------------------------------------------

def scrape_article(url: str) -> dict:
    """
    Fetch and extract a single article page.
    Returns dict with keys: title, content, image_url, source, url.
    Raises ValueError if content cannot be extracted.
    """
    with _client() as client:
        response = client.get(url)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")
    _clean_soup(soup)

    parsed_url = urlparse(url)
    hostname = (parsed_url.hostname or "").replace("www.", "")
    base_origin = f"{parsed_url.scheme}://{parsed_url.netloc}"

    # ---- Title ----
    title: str = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and isinstance(og_title, Tag):
        title = str(og_title.get("content", "")).strip()
    if not title:
        twitter_title = soup.find("meta", attrs={"name": "twitter:title"})
        if twitter_title and isinstance(twitter_title, Tag):
            title = str(twitter_title.get("content", "")).strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text(strip=True)
    title = title or "Untitled"

    # ---- Image ----
    image_url: str | None = None
    og_image = soup.find("meta", property="og:image")
    if og_image and isinstance(og_image, Tag):
        raw_img = str(og_image.get("content", "")).strip()
        if raw_img:
            image_url = urljoin(base_origin, raw_img)
    if not image_url:
        twitter_image = soup.find("meta", attrs={"name": "twitter:image"})
        if twitter_image and isinstance(twitter_image, Tag):
            raw_img = str(twitter_image.get("content", "")).strip()
            if raw_img:
                image_url = urljoin(base_origin, raw_img)
    if not image_url:
        for container_name in ["article", "main"]:
            container = soup.find(container_name)
            if container and isinstance(container, Tag):
                image_url = _extract_image(container, base_origin)
                if image_url:
                    break

    # ---- Content ----
    content = ""
    hardcoded_sel = _site_selector_for(hostname)

    # Priority 0: AI-learned domain profile (skip if we have a hardcoded selector)
    if not hardcoded_sel:
        from services.db import get_domain_profile
        profile = get_domain_profile(hostname)
        if profile and profile.get("selector"):
            try:
                tag = soup.select_one(profile["selector"])
                if tag and isinstance(tag, Tag):
                    content = _extract_text_from_tag(tag)
            except Exception:
                content = ""

    # Priority 1: Per-site custom selector (exact domain match)
    if not content and hardcoded_sel:
        for sel in hardcoded_sel.split(","):
            sel = sel.strip()
            tag = soup.select_one(sel)
            if tag and isinstance(tag, Tag):
                content = _extract_text_from_tag(tag)
                if len(content) > 200:
                    break

    # Priority 2: Schema.org articleBody
    if not content:
        tag = soup.find(attrs={"itemprop": "articleBody"})
        if tag and isinstance(tag, Tag):
            content = _extract_text_from_tag(tag)

    # Priority 3: Best <article> tag (by content score, not first match)
    if not content:
        article_tags = [t for t in soup.find_all("article") if isinstance(t, Tag)]
        if article_tags:
            best = max(article_tags, key=_score_content)
            content = _extract_text_from_tag(best)

    # Priority 4: Universal class selectors
    if not content:
        for sel in _UNIVERSAL_CONTENT_SELECTORS:
            tag = soup.select_one(sel)
            if tag and isinstance(tag, Tag):
                content = _extract_text_from_tag(tag)
                if len(content) > 200:
                    break

    # Priority 5: <main> tag
    if not content:
        main_tag = soup.find("main")
        if main_tag and isinstance(main_tag, Tag):
            content = _extract_text_from_tag(main_tag)

    # Priority 6: Readability-style scoring
    if not content:
        content = _readability_extract(soup)

    # Priority 7: All <p> tags on the whole page
    if not content:
        texts = [p.get_text(separator=" ", strip=True) for p in soup.find_all("p")]
        content = "\n\n".join(t for t in texts if len(t) > 30)

    # If extraction succeeded and no article body selector saved yet — learn in background
    if len(content.strip()) > 200 and not hardcoded_sel:
        from services.db import get_domain_profile
        existing = get_domain_profile(hostname)
        if not existing or not existing.get("selector"):
            skeleton = _build_html_skeleton(soup)
            _save_profile_async(hostname, skeleton, url)

    # Last resort: AI-assisted selector discovery (synchronous, when everything else failed)
    if not content or len(content.strip()) < 100:
        skeleton = _build_html_skeleton(soup)
        ai_selector = _ai_discover_selector(skeleton, url)
        if ai_selector:
            try:
                tag = soup.select_one(ai_selector)
                if tag and isinstance(tag, Tag):
                    content = _extract_text_from_tag(tag)
                    if len(content) > 100:
                        from services.db import save_domain_profile
                        save_domain_profile(hostname, ai_selector, url)
            except Exception:
                pass

    if not content or len(content.strip()) < 100:
        raise ValueError(
            f"Could not extract article content from the page. "
            f"The site may use JavaScript rendering or have a non-standard layout."
        )

    return {
        "title": str(title)[:500],
        "content": content[:20000],
        "image_url": str(image_url) if image_url else None,
        "source": hostname,
        "url": url,
    }
