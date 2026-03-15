import uuid
import httpx
from fastapi import APIRouter, HTTPException, Query
from models.schemas import Article, ArticleLink, DiscoverRequest, ExtractRequest, ManualArticleRequest
from services import db, scraper

router = APIRouter(tags=["articles"])


@router.get("/articles", response_model=list[Article])
def get_articles():
    """Return all scraped articles."""
    return db.get_all_articles()


@router.delete("/articles")
def delete_article(id: int = Query(...)):
    """Delete an article by id."""
    db.delete_article(id)
    return {"success": True}


@router.post("/articles/discover", response_model=list[ArticleLink])
def discover_articles(body: DiscoverRequest):
    """Discover article links on a given website URL."""
    try:
        return scraper.discover_article_links(body.url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/articles/extract", response_model=Article)
def extract_article(body: ExtractRequest):
    """Scrape and save a single article."""
    try:
        scraped = scraper.scrape_article(body.url)
        article = db.insert_article(
            url=body.url,
            title=scraped["title"],
            content=scraped["content"],
            image_url=scraped.get("image_url"),
            source=scraped["source"],
        )
        return article
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 404:
            raise HTTPException(status_code=422, detail="Article not found (404) — it may have been deleted or the URL is incorrect.")
        raise HTTPException(status_code=422, detail=f"Failed to fetch article (HTTP {status}).")
    except Exception as e:
        msg = str(e)
        if "UNIQUE constraint" in msg:
            raise HTTPException(status_code=409, detail="This article has already been added")
        raise HTTPException(status_code=500, detail=msg)


@router.post("/articles/extract-and-plan")
def extract_and_plan(body: ExtractRequest):
    """Scrape an article and immediately add it to the content plan."""
    try:
        # Try to get existing article first to avoid re-scraping
        article = db.get_article_by_url(body.url)
        if article is None:
            scraped = scraper.scrape_article(body.url)
            article = db.insert_article(
                url=body.url,
                title=scraped["title"],
                content=scraped["content"],
                image_url=scraped.get("image_url"),
                source=scraped["source"],
            )
        plan_item = db.add_to_content_plan(article["id"])
        return {"article": article, "planItem": plan_item}
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        if status == 404:
            raise HTTPException(status_code=422, detail="Article not found (404) — it may have been deleted or the URL is incorrect.")
        raise HTTPException(status_code=422, detail=f"Failed to fetch article (HTTP {status}).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/articles/manual-and-plan")
def manual_and_plan(body: ManualArticleRequest):
    """Create an article from manually entered text and add it to the content plan."""
    try:
        url = body.url.strip() if body.url and body.url.strip() else f"manual://{uuid.uuid4()}"
        article = db.insert_article(
            url=url,
            title=body.title.strip(),
            content=body.content.strip(),
            image_url=None,
            source="manual",
        )
        plan_item = db.add_to_content_plan(article["id"])
        return {"article": article, "planItem": plan_item}
    except Exception as e:
        msg = str(e)
        if "UNIQUE constraint" in msg:
            raise HTTPException(status_code=409, detail="Стаття з таким URL вже існує")
        raise HTTPException(status_code=500, detail=msg)


@router.post("/articles/create-and-plan")
def create_and_plan():
    """Create an empty manual draft article and add it to the content plan."""
    try:
        article = db.insert_article(
            url=f"manual://{uuid.uuid4()}",
            title="Нова стаття",
            content="",
            image_url=None,
            source="manual",
        )
        plan_item = db.add_to_content_plan(article["id"])
        return {"article": article, "planItem": plan_item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
