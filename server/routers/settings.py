from fastapi import APIRouter, HTTPException, Query
from models.schemas import (
    AuthorProfile,
    ExamplePost,
    SettingsResponse,
    UpdateProfileRequest,
    AddExamplePostRequest,
)
from services import db

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=SettingsResponse)
def get_settings():
    """Return author profile and example posts."""
    return {
        "profile": db.get_profile(),
        "examplePosts": db.get_example_posts(),
    }


@router.patch("/settings", response_model=AuthorProfile)
def update_settings(body: UpdateProfileRequest):
    """Update author profile fields."""
    try:
        return db.update_profile(body.model_dump(exclude_none=True))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/settings", response_model=ExamplePost)
def add_example_post(body: AddExamplePostRequest):
    """Add a new example post."""
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Content is required")
    try:
        return db.add_example_post(body.content.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/settings")
def delete_example_post(id: int = Query(...)):
    """Delete an example post by id."""
    db.delete_example_post(id)
    return {"success": True}
