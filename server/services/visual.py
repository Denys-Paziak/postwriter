"""
Visual content service — LinkedIn carousel PDF and cover image generation.

Functions:
  generate_carousel()    — Gemini text → slide JSON → fpdf2 PDF → saved to static/visuals/
  generate_cover_image() — Gemini Imagen REST API → PNG saved to static/visuals/
"""

import base64
import json
import os
from pathlib import Path

import httpx
from google import genai

STATIC_DIR = Path(__file__).parent.parent / "static" / "visuals"


def _client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def _generate_slide_content(title: str, content: str, post_text: str, api_key: str) -> list[dict]:
    """Ask Gemini to produce 5-7 slides as a JSON array."""
    prompt = (
        "На основі статті та LinkedIn посту створи контент для карусельного PDF (5-7 слайдів).\n\n"
        f"Стаття: {title}\n{content[:3000]}\n\n"
        f"LinkedIn пост:\n{post_text[:1000]}\n\n"
        "Поверни ТІЛЬКИ JSON без markdown-огортання:\n"
        '{"slides": [{"title": "...", "body": "...", "type": "cover|content|cta"}]}\n\n'
        "Правила:\n"
        "- Перший слайд (cover): title = назва теми (до 60 символів), body = підзаголовок\n"
        "- Слайди 2-N (content): title = ключовий тезис (до 60 символів), body = 2-3 речення (до 180 символів)\n"
        "- Останній (cta): title = заклик до дії, body = питання для дискусії або хештеги\n"
        "- Всього 5-7 слайдів. Мова: українська."
    )
    response = _client(api_key).models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)["slides"]


def _render_carousel_pdf(slides: list[dict], output_path: str) -> None:
    """Render slide list to a 1080×1080pt PDF using fpdf2."""
    from fpdf import FPDF  # lazy import — not required at startup

    pdf = FPDF(unit="pt", format=(1080, 1080))
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    for i, slide in enumerate(slides):
        pdf.add_page()

        # Dark navy background
        pdf.set_fill_color(15, 15, 30)
        pdf.rect(0, 0, 1080, 1080, "F")

        # Indigo left accent bar
        pdf.set_fill_color(99, 102, 241)
        pdf.rect(0, 0, 8, 1080, "F")

        # Title
        pdf.set_xy(60, 280)
        pdf.set_font("Helvetica", "B", 52)
        pdf.set_text_color(255, 255, 255)
        pdf.multi_cell(960, 68, slide["title"], align="L")

        # Body
        if slide.get("body"):
            pdf.set_xy(60, pdf.get_y() + 36)
            pdf.set_font("Helvetica", "", 36)
            pdf.set_text_color(160, 174, 192)
            pdf.multi_cell(960, 50, slide["body"], align="L")

        # Slide counter (bottom right)
        pdf.set_xy(0, 1022)
        pdf.set_font("Helvetica", "", 22)
        pdf.set_text_color(80, 80, 100)
        pdf.cell(1060, 40, f"{i + 1}/{len(slides)}", align="R")

    pdf.output(output_path)


def generate_carousel(
    item_id: int,
    title: str,
    content: str,
    post_text: str,
    api_key: str,
) -> str:
    """Generate PDF carousel and return its URL path (/static/visuals/...)."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    slides = _generate_slide_content(title, content, post_text, api_key)
    output_path = str(STATIC_DIR / f"{item_id}_carousel.pdf")
    _render_carousel_pdf(slides, output_path)
    return f"/static/visuals/{item_id}_carousel.pdf"


def _generate_image_prompt(title: str, post_text: str, api_key: str) -> str:
    """Ask Gemini to generate a professional English image prompt for Pollinations."""
    # Base fallback prompt (Generic English prompt)
    fallback = "Professional business cover, minimalist abstract corporate background, high quality photography"

    if not api_key:
        return fallback

    prompt = (
        "Based on the following LinkedIn post title and content, create a short (max 30 words), "
        "professional English image prompt for an AI generator.\n\n"
        f"Title: {title}\n"
        f"Content: {post_text[:500]}\n\n"
        "Rules:\n"
        "- The prompt MUST BE ONLY IN ENGLISH.\n"
        "- NO TEXT in the image.\n"
        "- Style: Clean, modern, minimalist, business photography.\n"
        "- Output ONLY the prompt string."
    )
    
    # Try gemini-2.0-flash, then fallback to gemini-1.5-flash (which usually has different quota)
    for model_name in ["gemini-2.0-flash", "gemini-1.5-flash"]:
        try:
            response = _client(api_key).models.generate_content(
                model=model_name,
                contents=prompt,
            )
            res = response.text.strip().replace('"', '')
            if len(res) > 5:
                return res
        except Exception:
            continue
            
    return fallback


def generate_cover_image(
    item_id: int,
    title: str,
    post_text: str,
    api_key: str,
) -> str:
    """Generate a 1:1 cover image via Pollinations.ai.
    Uses Gemini to translate/refine the prompt into English for better reliability.
    Falls back to smaller dimensions or faster models if needed.
    """
    from urllib.parse import quote
    import time

    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate an English prompt (shorter is better for speed/reliability)
    image_prompt = _generate_image_prompt(title, post_text, api_key)
    
    # Strict ASCII cleaning - avoid Pollinations 500s on special chars
    safe_prompt = "".join(c for c in image_prompt if (ord(c) < 128) and (c.isalnum() or c.isspace() or c in ",.-"))
    if not safe_prompt.strip():
        safe_prompt = "Professional business abstract background"
    
    # Try multiple models in order of quality/stability
    models = ["flux", "turbo", "unity"]
    last_error = ""

    for i, model in enumerate(models):
        # Using 512x512 as a fallback for stability if initial 720x720 fails
        size = 720 if i == 0 else 512
        url = (
            f"https://image.pollinations.ai/prompt/{quote(safe_prompt)}"
            f"?width={size}&height={size}&model={model}&nologo=true&enhance=true&safe=true"
        )
        
        try:
            # First attempt (flux) should be relatively fast or we skip it
            # Subsequent attempts (turbo/unity) can be longer
            timeout = 30.0 if model == "flux" else 60.0
            
            with httpx.Client(timeout=timeout, follow_redirects=True) as http:
                resp = http.get(url)
                resp.raise_for_status()
                image_bytes = resp.content

            output_path = STATIC_DIR / f"{item_id}_cover.png"
            output_path.write_bytes(image_bytes)
            return f"/static/visuals/{item_id}_cover.png"
        except Exception as e:
            last_error = str(e)
            if i < len(models) - 1:
                time.sleep(2) # Small pause before trying next model
            continue

    if "429" in last_error:
        raise Exception("Помилка: занадто багато запитів. Спробуйте через 1-2 хвилини.")
    raise Exception(f"Не вдалося згенерувати зображення. Всі моделі (Flux, Turbo) перевантажені або недоступні. [{last_error}]")
