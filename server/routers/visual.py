"""
Visual content router — generate cover image and carousel PDF for a content plan item.

Endpoints:
  POST /api/visual/{item_id}/carousel  — generate PDF carousel, save URL to DB
  POST /api/visual/{item_id}/image     — generate cover image, save URL to DB
"""

import os

from fastapi import APIRouter, HTTPException

from services import db
from services.visual import generate_carousel as _gen_carousel
from services.visual import generate_cover_image as _gen_image

router = APIRouter(tags=["visual"])


def _api_key() -> str:
    """Return the configured Gemini API key (profile key takes priority)."""
    profile = db.get_profile()
    return (profile.get("gemini_api_key") or "").strip() or os.environ.get("GEMINI_API_KEY", "")


@router.post("/visual/{item_id}/carousel")
def gen_carousel(item_id: int):
    """Generate a PDF carousel for the given content plan item."""
    item = db.get_content_plan_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    try:
        url = _gen_carousel(
            item_id=item_id,
            title=item["title"],
            content=item.get("content") or "",
            post_text=item.get("generated_post") or "",
            api_key=_api_key(),
        )
        updated = db.update_content_plan(item_id, {"carousel_url": url})
        return {"carousel_url": url, "item": updated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/visual/{item_id}/image")
def gen_image(item_id: int):
    """Generate a cover image for the given content plan item via Gemini Imagen."""
    item = db.get_content_plan_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    try:
        url = _gen_image(
            item_id=item_id,
            title=item["title"],
            post_text=item.get("generated_post") or "",
            api_key=_api_key(),
        )
        updated = db.update_content_plan(item_id, {"cover_image_url": url})
        return {"cover_image_url": url, "item": updated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
