"""
Visual content service — LinkedIn carousel PDF and cover image generation.

Functions:
  generate_carousel()    — Gemini text → slide JSON → fpdf2 PDF → saved to static/visuals/
  generate_cover_image() — Gemini text → Pillow canvas template → PNG saved to static/visuals/
"""

import json
from pathlib import Path

from google import genai

STATIC_DIR = Path(__file__).parent.parent / "static" / "visuals"
FONTS_DIR = Path(__file__).parent.parent / "static" / "fonts"

# Inter WOFF subsets shipped with the frontend (no downloads needed)
_WOFF_BASE = (
    Path(__file__).parent.parent.parent
    / "client" / "node_modules" / "@fontsource" / "inter" / "files"
)


def _client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


# ── Carousel helpers ──────────────────────────────────────────────────────────

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
    client = _client(api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    text = response.text.strip()
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


# ── Cover image helpers ───────────────────────────────────────────────────────

def _ensure_inter_fonts() -> tuple[Path, Path]:
    """Convert Inter WOFF subsets → TTF on first run; return (bold, regular) paths.

    Uses fonttools (already installed) to merge Cyrillic + Latin subsets so the
    font handles both Ukrainian and ASCII text. Result is cached in static/fonts/.
    """
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    bold_path = FONTS_DIR / "Inter-Bold.ttf"
    regular_path = FONTS_DIR / "Inter-Regular.ttf"

    if bold_path.exists() and regular_path.exists():
        return bold_path, regular_path

    from fontTools.merge import Merger  # already installed (fonttools)

    for weight, out_path in [("700", bold_path), ("400", regular_path)]:
        if out_path.exists():
            continue
        cyr = str(_WOFF_BASE / f"inter-cyrillic-{weight}-normal.woff")
        lat = str(_WOFF_BASE / f"inter-latin-{weight}-normal.woff")
        merger = Merger()
        font = merger.merge([cyr, lat])
        font.flavor = None  # strip WOFF wrapper → plain TTF
        font.save(str(out_path))

    return bold_path, regular_path


def _generate_cover_content(title: str, post_text: str, api_key: str) -> dict:
    """Ask Gemini for short branded content for the cover canvas."""
    prompt = (
        "На основі заголовку та тексту посту створи контент для обкладинки LinkedIn поста.\n"
        "Поверни ТІЛЬКИ JSON без markdown:\n"
        '{"category": "...", "headline": "...", "tagline": "..."}\n\n'
        "Правила:\n"
        "- category: 1-2 слова, тематична категорія (наприклад: Розробка, AI, Маркетинг, Дизайн)\n"
        "- headline: до 50 символів, стислий і сильний заголовок\n"
        "- tagline: 60-110 символів, цікавий хук або опис\n"
        "- Мова: українська\n\n"
        f"Заголовок: {title}\n"
        f"Текст посту: {(post_text or '')[:500]}"
    )
    client = _client(api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _wrap_text(text: str, font, max_width: int) -> list[str]:
    """Break text into lines that fit within max_width pixels."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if font.getlength(candidate) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _render_cover_canvas(
    content: dict,
    output_path: str,
    bold_font_path: Path,
    regular_font_path: Path,
) -> None:
    """Render the designed 720×720 PNG cover image using Pillow."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    W, H = 720, 720
    # Design system palette
    BG       = (9, 9, 11)
    VIOLET   = (139, 92, 246)
    WHITE    = (255, 255, 255)
    MUTED    = (161, 161, 170)
    BRAND    = (113, 113, 122)
    # Content area
    LEFT     = 68   # 8px accent bar + 60px inner padding
    RIGHT    = 660
    CONTENT_W = RIGHT - LEFT  # 592px available width

    # ── 1. Base background ────────────────────────────────────────────────────
    base = Image.new("RGB", (W, H), BG)

    # ── 2. Ambient violet glow (top-right, blurred) ───────────────────────────
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = 650, 65
    for r in range(260, 0, -10):
        alpha = int(22 * (1 - r / 260))
        gd.ellipse([gx - r, gy - r, gx + r, gy + r], fill=(*VIOLET, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(55))
    base = Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB")

    draw = ImageDraw.Draw(base)

    # ── 3. Decorative circle arcs (bottom-right, very subtle) ─────────────────
    # Pre-blended with BG: violet @ ~12% and ~7%
    draw.arc([490, 430, 1050, 990], start=180, end=360, fill=(35, 24, 62), width=1)
    draw.arc([545, 480, 975, 910],  start=180, end=360, fill=(24, 16, 42), width=1)

    # ── 4. Left accent bar ────────────────────────────────────────────────────
    draw.rectangle([0, 0, 7, H], fill=VIOLET)

    # ── 5. Load fonts ─────────────────────────────────────────────────────────
    f_bold_54   = ImageFont.truetype(str(bold_font_path), 54)
    f_bold_13   = ImageFont.truetype(str(bold_font_path), 13)
    f_reg_28    = ImageFont.truetype(str(regular_font_path), 28)
    f_reg_20    = ImageFont.truetype(str(regular_font_path), 20)

    # ── 6. Category tag pill ──────────────────────────────────────────────────
    category = content.get("category", "LinkedIn").upper()
    PX, PY = 14, 10   # horizontal/vertical padding inside pill
    cat_bb = f_bold_13.getbbox(category)
    cat_text_w = cat_bb[2] - cat_bb[0]
    cat_text_h = cat_bb[3] - cat_bb[1]
    pill_w = cat_text_w + PX * 2
    pill_h = cat_text_h + PY * 2
    pill_x, pill_y = LEFT, 54
    pill_r = pill_h // 2

    # Pill background (violet @ ~11% on #09090b → pre-blended)
    tag_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tld = ImageDraw.Draw(tag_layer)
    tld.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=pill_r, fill=(*VIOLET, 28),
    )
    base = Image.alpha_composite(base.convert("RGBA"), tag_layer).convert("RGB")
    draw = ImageDraw.Draw(base)

    # Pill border (violet @ ~40%)
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=pill_r, outline=(95, 58, 175), width=1,
    )
    # Category label — anchored to top-left of bounding box
    draw.text(
        (pill_x + PX - cat_bb[0], pill_y + PY - cat_bb[1]),
        category, font=f_bold_13, fill=VIOLET,
    )

    # ── 7. Headline ───────────────────────────────────────────────────────────
    headline = content.get("headline", "")
    h_lines = _wrap_text(headline, f_bold_54, CONTENT_W)[:2]
    hy = pill_y + pill_h + 34
    for line in h_lines:
        bb = f_bold_54.getbbox(line)
        draw.text((LEFT - bb[0], hy - bb[1]), line, font=f_bold_54, fill=WHITE)
        hy += 66

    # ── 8. Tagline ────────────────────────────────────────────────────────────
    tagline = content.get("tagline", "")
    t_lines = _wrap_text(tagline, f_reg_28, CONTENT_W)[:3]
    ty = hy + 22
    for line in t_lines:
        bb = f_reg_28.getbbox(line)
        draw.text((LEFT - bb[0], ty - bb[1]), line, font=f_reg_28, fill=MUTED)
        ty += 42

    # ── 9. Divider + branding ─────────────────────────────────────────────────
    div_y = 630
    draw.line([(LEFT, div_y), (RIGHT, div_y)], fill=(48, 46, 58), width=1)
    bb = f_reg_20.getbbox("SMM Planner")
    draw.text((LEFT - bb[0], div_y + 18 - bb[1]), "SMM Planner", font=f_reg_20, fill=BRAND)

    base.save(output_path, "PNG")


def generate_cover_image(
    item_id: int,
    title: str,
    post_text: str,
    api_key: str,
) -> str:
    """Generate a branded 720×720 PNG cover using AI text + Pillow canvas rendering."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    output_path = str(STATIC_DIR / f"{item_id}_cover.png")
    bold_font, regular_font = _ensure_inter_fonts()
    content = _generate_cover_content(title, post_text, api_key)
    _render_cover_canvas(content, output_path, bold_font, regular_font)
    return f"/static/visuals/{item_id}_cover.png"
