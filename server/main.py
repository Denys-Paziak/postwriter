"""
SMM API — FastAPI backend server.
Start: uvicorn main:app --reload --port 8000
Docs:  http://localhost:8000/docs
"""

from dotenv import load_dotenv
load_dotenv()

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import articles, content_plan, research, generate, settings, sources, stats, visual

app = FastAPI(
    title="SMM API",
    description="Backend for the SMM content management tool.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(articles.router, prefix="/api")
app.include_router(content_plan.router, prefix="/api")
app.include_router(research.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(visual.router, prefix="/api")

# Serve generated files (carousel PDFs, cover images)
_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(exist_ok=True)
(_static_dir / "visuals").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
