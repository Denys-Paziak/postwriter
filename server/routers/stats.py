from fastapi import APIRouter
from services import db

router = APIRouter(tags=["stats"])


@router.get("/stats")
def get_stats():
    """Return dashboard statistics: article counts by status."""
    return db.get_stats()
