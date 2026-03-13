"""
LinkedIn router — OAuth 2.0 flow + publishing endpoint.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from services import db, linkedin as li_service

router = APIRouter(tags=["linkedin"])


@router.get("/linkedin/status")
def linkedin_status():
    """Return whether the LinkedIn account is connected."""
    profile = db.get_profile()
    if not profile:
        return {"connected": False}
    connected = bool(profile.get("linkedin_access_token") and profile.get("linkedin_person_id"))
    return {"connected": connected}


@router.get("/linkedin/auth-url")
def get_auth_url():
    """Return the LinkedIn OAuth authorization URL."""
    profile = db.get_profile()
    if not profile or not profile.get("linkedin_client_id"):
        raise HTTPException(status_code=400, detail="LinkedIn Client ID not configured. Please set it in Settings.")
    url = li_service.get_auth_url(profile["linkedin_client_id"])
    return {"url": url}


@router.get("/linkedin/callback")
def linkedin_callback(code: str = None, error: str = None, state: str = None):
    """Handle LinkedIn OAuth callback, exchange code for token and store it."""
    if error:
        return RedirectResponse(url=f"http://localhost:3000/settings?linkedin_error={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")

    profile = db.get_profile()
    if not profile or not profile.get("linkedin_client_id") or not profile.get("linkedin_client_secret"):
        return RedirectResponse(url="http://localhost:3000/settings?linkedin_error=missing_credentials")

    try:
        token_data = li_service.exchange_code(
            code=code,
            client_id=profile["linkedin_client_id"],
            client_secret=profile["linkedin_client_secret"],
        )
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access token returned")

        person_id = li_service.get_person_id(access_token)

        db.update_profile({
            "linkedin_access_token": access_token,
            "linkedin_person_id": person_id,
        })

        return RedirectResponse(url="http://localhost:3000/settings?linkedin_success=1")

    except Exception as e:
        return RedirectResponse(url=f"http://localhost:3000/settings?linkedin_error=token_error")


@router.post("/linkedin/publish/{item_id}")
def publish_to_linkedin(item_id: int):
    """Publish a content plan post to LinkedIn."""
    profile = db.get_profile()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not found")

    access_token = profile.get("linkedin_access_token")
    person_id = profile.get("linkedin_person_id")

    if not access_token or not person_id:
        raise HTTPException(
            status_code=400,
            detail="LinkedIn account not connected. Please connect it in Settings."
        )

    item = db.get_content_plan_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content plan item not found")

    post_text = item.get("generated_post")
    if not post_text or not post_text.strip():
        raise HTTPException(status_code=400, detail="No generated post text to publish")

    try:
        li_service.publish_post(access_token, person_id, post_text)
    except Exception as e:
        err_str = str(e)
        if "401" in err_str:
            raise HTTPException(status_code=401, detail="LinkedIn token expired. Please reconnect in Settings.")
        raise HTTPException(status_code=500, detail=f"Failed to publish: {err_str}")

    # Mark as published
    updated = db.update_content_plan(item_id, {"status": "published"})
    return {"success": True, "item": updated}
