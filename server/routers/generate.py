"""
Generate router — SSE endpoint for LinkedIn post generation.

Uses GenerationCrew (ContentStrategist + Copywriter + VoiceEditor + HumanityEditor)
to produce high-quality, human-sounding posts. Streams progress in real-time.

SSE event types:
  - progress: {"type": "progress", "message": "..."}
  - done:     {"type": "done", "item": {...}}
  - error:    {"type": "error", "message": "..."}
"""

import asyncio
import json

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from models.schemas import GenerateRequest
from services import db
from services.crew_generate import run_generation_crew
from utils.error_handlers import format_ai_error

router = APIRouter(tags=["generate"])


def _event(data: dict) -> dict:
    return {"data": json.dumps(data, ensure_ascii=False)}


@router.post("/generate")
async def generate(body: GenerateRequest):
    """
    Generate a LinkedIn post for a content plan item.
    Streams SSE progress events while the GenerationCrew runs.
    """
    async def stream():
        try:
            yield _event({"type": "progress", "message": "Готуємо дані..."})

            item = db.get_content_plan_item(body.content_plan_id)
            if not item:
                yield _event({"type": "error", "message": "Статтю не знайдено"})
                return

            profile = db.get_profile()
            example_posts = db.get_example_posts()

            # Build author context — always include custom API key if present
            custom_key = (profile.get("gemini_api_key") or "").strip() or None
            author: dict | None = None
            if profile.get("about") or profile.get("avoid_words") or example_posts or custom_key:
                author = {
                    "about": profile.get("about") or None,
                    "avoid_words": profile.get("avoid_words") or None,
                    "gemini_api_key": custom_key,
                    "example_posts": [p["content"] for p in example_posts] if example_posts else None,
                }

            yield _event({"type": "progress", "message": "Запускаємо команду генерації..."})

            queue = run_generation_crew(
                article_title=item["title"],
                article_content=item["content"],
                tone=body.tone,
                research=item.get("research"),
                author=author,
            )
            loop = asyncio.get_running_loop()

            while True:
                msg = await loop.run_in_executor(None, queue.get)
                if msg is None:
                    break

                if msg["type"] == "progress":
                    yield _event(msg)

                elif msg["type"] == "result":
                    updated = db.update_content_plan(
                        body.content_plan_id,
                        {"generated_post": msg["data"], "status": "in_progress"},
                    )
                    yield _event({"type": "done", "item": updated})

                elif msg["type"] == "error":
                    msg["message"] = format_ai_error(msg["message"])
                    yield _event(msg)
                    return

        except Exception as e:
            yield _event({"type": "error", "message": format_ai_error(e)})

    return EventSourceResponse(stream())
