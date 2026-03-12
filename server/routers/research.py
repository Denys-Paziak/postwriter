"""
Research router — SSE endpoint for audience research generation.

Uses ResearchCrew (WebResearcher + ResearchAnalyst agents) to produce
real, web-grounded research reports. Progress events stream in real-time.

SSE event types:
  - progress: {"type": "progress", "message": "..."}
  - done:     {"type": "done", "item": {...}}
  - error:    {"type": "error", "message": "..."}
"""

import asyncio
import json

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from models.schemas import ResearchRequest
from services import db
from services.crew_research import run_research_crew
from utils.error_handlers import format_ai_error

router = APIRouter(tags=["research"])


def _event(data: dict) -> dict:
    return {"data": json.dumps(data, ensure_ascii=False)}


@router.post("/research")
async def research(body: ResearchRequest):
    """
    Generate audience research for a content plan item.
    Streams SSE progress events while the ResearchCrew runs.
    """
    async def stream():
        try:
            yield _event({"type": "progress", "message": "Аналізуємо тему статті..."})

            item = db.get_content_plan_item(body.content_plan_id)
            if not item:
                yield _event({"type": "error", "message": "Статтю не знайдено"})
                return

            yield _event({"type": "progress", "message": "Запускаємо дослідницьку команду..."})

            # Use user's custom Gemini API key if available
            profile = db.get_profile()
            custom_key = (profile.get("gemini_api_key") or "").strip() or None

            queue = run_research_crew(item["title"], item["content"], api_key=custom_key)
            loop = asyncio.get_running_loop()

            while True:
                msg = await loop.run_in_executor(None, queue.get)
                if msg is None:
                    break  # sentinel — crew finished

                if msg["type"] == "progress":
                    yield _event(msg)

                elif msg["type"] == "result":
                    updated = db.update_content_plan(
                        body.content_plan_id, {"research": msg["data"]}
                    )
                    yield _event({"type": "done", "item": updated})

                elif msg["type"] == "error":
                    msg["message"] = format_ai_error(msg["message"])
                    yield _event(msg)
                    return

        except Exception as e:
            yield _event({"type": "error", "message": format_ai_error(e)})

    return EventSourceResponse(stream())
