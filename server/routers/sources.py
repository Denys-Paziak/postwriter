from fastapi import APIRouter, HTTPException, Query
from models.schemas import Source, AddSourceRequest
from services import db
from urllib.parse import urlparse

router = APIRouter(tags=["sources"])


@router.get("/sources", response_model=list[Source])
def get_sources():
    """Return all saved source URLs."""
    return db.get_all_sources()


@router.post("/sources", response_model=Source)
def add_source(body: AddSourceRequest):
    """Add a new source URL."""
    if not body.url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        hostname = urlparse(body.url).hostname or body.url
        name = hostname.replace("www.", "")
        return db.add_source(body.url, name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sources")
def delete_source(id: int = Query(...)):
    """Delete a source by id."""
    db.delete_source(id)
    return {"success": True}
