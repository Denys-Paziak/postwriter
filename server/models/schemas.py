"""Pydantic request/response models."""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class Article(BaseModel):
    id: int
    url: str
    title: str
    content: str
    image_url: Optional[str] = None
    source: str
    created_at: str


class ContentPlanItem(BaseModel):
    id: int
    article_id: int
    status: str
    generated_post: Optional[str] = None
    research: Optional[str] = None
    notes: Optional[str] = None
    scheduled_date: Optional[str] = None
    created_at: str
    # joined article fields
    title: Optional[str] = None
    url: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    source: Optional[str] = None
    # visual content
    carousel_url: Optional[str] = None
    cover_image_url: Optional[str] = None


class Source(BaseModel):
    id: int
    url: str
    name: str
    created_at: str


class AuthorProfile(BaseModel):
    id: int
    name: str
    expertise: str
    tone: str
    about: str
    avoid_words: str
    gemini_api_key: Optional[str] = None


class ExamplePost(BaseModel):
    id: int
    content: str
    created_at: str


class ArticleLink(BaseModel):
    url: str
    title: str
    image: Optional[str] = None
    excerpt: Optional[str] = None


# --- Request bodies ---

class DiscoverRequest(BaseModel):
    url: str


class ExtractRequest(BaseModel):
    url: str


class AddSourceRequest(BaseModel):
    url: str


class AddToContentPlanRequest(BaseModel):
    article_id: int


class ManualArticleRequest(BaseModel):
    title: str
    content: str
    url: Optional[str] = None


class UpdateContentPlanRequest(BaseModel):
    status: Optional[str] = None
    generated_post: Optional[str] = None
    research: Optional[str] = None
    notes: Optional[str] = None
    scheduled_date: Optional[str] = None
    carousel_url: Optional[str] = None
    cover_image_url: Optional[str] = None


class ResearchRequest(BaseModel):
    content_plan_id: int


class GenerateRequest(BaseModel):
    content_plan_id: int
    tone: str = "value"


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    expertise: Optional[str] = None
    tone: Optional[str] = None
    about: Optional[str] = None
    avoid_words: Optional[str] = None
    gemini_api_key: Optional[str] = None


class AddExamplePostRequest(BaseModel):
    content: str


class SettingsResponse(BaseModel):
    profile: AuthorProfile
    examplePosts: list[ExamplePost]
