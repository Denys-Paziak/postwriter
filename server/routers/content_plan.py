from fastapi import APIRouter, HTTPException, Query
from models.schemas import (
    ContentPlanItem,
    AddToContentPlanRequest,
    UpdateContentPlanRequest,
)
from services import db

router = APIRouter(tags=["content-plan"])


@router.get("/content-plan", response_model=list[ContentPlanItem])
def get_content_plan():
    """Return all content plan items with joined article data."""
    return db.get_all_content_plan()


@router.post("/content-plan", response_model=ContentPlanItem)
def add_to_plan(body: AddToContentPlanRequest):
    """Add an article to the content plan."""
    try:
        return db.add_to_content_plan(body.article_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/content-plan")
def delete_plan_item(id: int = Query(...)):
    """Delete a content plan item by id."""
    db.delete_content_plan_item(id)
    return {"success": True}


@router.get("/content-plan/{item_id}", response_model=ContentPlanItem)
def get_plan_item(item_id: int):
    """Return a single content plan item."""
    item = db.get_content_plan_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.patch("/content-plan/{item_id}", response_model=ContentPlanItem)
def update_plan_item(item_id: int, body: UpdateContentPlanRequest):
    """Partially update a content plan item."""
    try:
        return db.update_content_plan(item_id, body.model_dump(exclude_none=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
