"""
GeminiSearchTool — CrewAI tool wrapping Gemini with Google Search grounding.

Uses the google-genai SDK because Google Search grounding is a native Gemini
API feature that LiteLLM does not expose.
Used by the WebResearcher agent in ResearchCrew.
"""

import os

from crewai.tools import BaseTool
from google import genai
from google.genai import types
from pydantic import BaseModel, Field


class GeminiSearchInput(BaseModel):
    query: str = Field(description="Search query to find recent real information about a topic")


class GeminiSearchTool(BaseTool):
    name: str = "web_search"
    description: str = (
        "Search the web for recent, real information about a topic. "
        "Returns discussions, opinions, questions, statistics, and facts found on the internet."
    )
    args_schema: type[BaseModel] = GeminiSearchInput

    def _run(self, query: str) -> str:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=(
                f"Find real, recent information about: {query}. "
                "Include facts, statistics, forum discussions, Reddit threads, "
                "Quora answers, blog comments, and diverse opinions."
            ),
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
        return response.text
