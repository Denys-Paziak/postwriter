"""
LinkedIn service — OAuth 2.0 + Share API.
"""

import httpx
from urllib.parse import urlencode

LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_PROFILE_URL = "https://api.linkedin.com/v2/userinfo"
LINKEDIN_SHARE_URL = "https://api.linkedin.com/v2/ugcPosts"

SCOPES = "openid profile email w_member_social"
REDIRECT_URI = "http://localhost:8000/api/linkedin/callback"


def get_auth_url(client_id: str, state: str = "linkedin_oauth") -> str:
    """Build the LinkedIn OAuth authorization URL."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "scope": SCOPES,
    }
    return f"{LINKEDIN_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, client_id: str, client_secret: str) -> dict:
    """Exchange authorization code for access token."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    resp = httpx.post(LINKEDIN_TOKEN_URL, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_person_id(access_token: str) -> str:
    """Return the user's LinkedIn sub (person URN)."""
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = httpx.get(LINKEDIN_PROFILE_URL, headers=headers, timeout=10)
    resp.raise_for_status()
    profile = resp.json()
    return profile.get("sub", "")


def publish_post(access_token: str, person_id: str, text: str) -> dict:
    """Publish a text post to LinkedIn using UGC Posts API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }
    payload = {
        "author": f"urn:li:person:{person_id}",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        },
    }
    resp = httpx.post(LINKEDIN_SHARE_URL, json=payload, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.json()
