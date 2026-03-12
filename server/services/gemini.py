"""
Gemini AI service — research and post generation.
Uses google-genai SDK with Google Search grounding for research.
"""

import os

from google import genai
from google.genai import types

_TONE_INSTRUCTIONS = {
    "value": """Ціль посту: поділитися корисною інформацією з читачем.
- Подай ключові інсайти та практичні поради зі статті
- Структуруй як "ось що я дізнався / ось що варто знати"
- Дай читачу конкретну цінність яку він може застосувати
- Закінчи порадою або корисним висновком""",

    "opinion": """Ціль посту: висловити свою особисту думку/позицію.
- Почни з чіткого твердження або тези
- Аргументуй свою позицію на основі статті
- Будь впевненим у своїй думці але не агресивним
- Закінчи питанням "А що думаєте ви?\"""",

    "story": """Ціль посту: розповісти історію/поділитися досвідом.
- Подай інформацію через особистий досвід або спостереження
- Використай наратив: "Нещодавно я...", "Помітив цікаву тенденцію..."
- Зроби пост емоційним та близьким до читача
- Закінчи висновком з власного досвіду""",

    "discussion": """Ціль посту: викликати дискусію в коментарях.
- Постав провокативне питання або неочевидну тезу
- Покажи дві сторони питання
- Запроси читачів поділитися своїм досвідом
- Закінчи відкритим питанням для обговорення""",

    # alias used by frontend
    "insight": """Ціль посту: поділитися інсайтом або думкою.
- Почни з нетривіального спостереження
- Розкрий контекст та наслідки
- Будь конкретним, уникай загальних слів
- Закінчи практичним висновком""",
}


def _make_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=api_key)


def generate_research(article_title: str, article_content: str) -> str:
    """
    Generate audience research for an article topic.
    Uses Google Search grounding to base findings on real web discussions.
    Returns structured Ukrainian-language research text.
    """
    client = _make_client()

    prompt = f"""Ти - дослідник який аналізує тему для створення контенту в соціальних мережах.
Використай Google Search щоб знайти реальні обговорення цієї теми на форумах, Reddit, Quora, в коментарях та соціальних мережах.

Структура відповіді:

🔍 КЛЮЧОВІ ПИТАННЯ АУДИТОРІЇ
- Які питання найчастіше задають люди по цій темі? (3-5 питань)

💬 ТИПОВІ ДУМКИ ТА ПОЗИЦІЇ
- Які є основні точки зору? Що люди підтримують, а що критикують? (3-5 думок)

⚡ БОЛЬОВІ ТОЧКИ
- З якими проблемами стикаються люди в контексті цієї теми? (2-4 проблеми)

💡 ПОПУЛЯРНІ ПОРАДИ ТА РЕКОМЕНДАЦІЇ
- Які поради дають досвідчені люди в цій сфері? (3-5 порад)

🔥 СПІРНІ МОМЕНТИ
- Які аспекти теми викликають найбільші дебати? (2-3 пункти)

Заголовок статті: {article_title}

Зміст статті:
{article_content[:5000]}

Пиши українською мовою. Будь конкретним та практичним. Базуйся на реальних обговореннях знайдених через пошук."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )
    return response.text


def generate_linkedin_post(
    article_title: str,
    article_content: str,
    tone: str = "value",
    research: str | None = None,
    author: dict | None = None,
) -> str:
    """
    Generate a LinkedIn post from an article.

    Args:
        article_title: Title of the source article.
        article_content: Body text of the article (truncated to 5000 chars).
        tone: One of value/opinion/story/discussion/insight.
        research: Optional research findings to enrich the post.
        author: Optional dict with about, avoid_words, example_posts keys.

    Returns:
        Ready-to-publish LinkedIn post text in Ukrainian.
    """
    client = _make_client()

    tone_block = _TONE_INSTRUCTIONS.get(tone, _TONE_INSTRUCTIONS["value"])

    author_block = ""
    if author:
        parts = []
        if author.get("about"):
            parts.append(f"АВТОР: {author['about']}")
        if author.get("avoid_words"):
            parts.append(f"\nНІКОЛИ НЕ ВИКОРИСТОВУЙ ці слова/фрази: {author['avoid_words']}")
        example_posts = author.get("example_posts") or []
        if example_posts:
            parts.append("\nПРИКЛАДИ РЕАЛЬНИХ ПОСТІВ АВТОРА — твій пост має звучати ТАК САМО:")
            for i, post in enumerate(example_posts[:3]):
                parts.append(f"\n--- Приклад {i + 1} ---\n{post[:1500]}")
            parts.append("\n---")
            parts.append(
                "Копіюй із прикладів: довжину речень, лексику, структуру, рівень емодзі, ступінь формальності. "
                "Якщо автор пише коротко — пиши коротко. Якщо без емодзі — без емодзі. Якщо з гумором — з гумором."
            )
        author_block = "\n".join(parts)

    research_block = ""
    if research:
        research_block = (
            f"\nДодаткове дослідження теми (думки людей, питання, поради з форумів):\n{research[:3000]}\n"
            "Використай ці інсайти щоб зробити пост більш релевантним та резонуючим з аудиторією."
        )

    prompt = f"""Напиши пост для LinkedIn українською мовою на основі статті нижче.

{author_block + chr(10) + chr(10) if author_block else ""}{tone_block}

ЯК ПИСАТИ:
- Від першої особи
- Короткі абзаци, 1-2 речення на абзац
- Перше речення — хук, який чіпляє (не питання і не "Уявіть собі")
- 150-250 слів (не більше)
- 3-5 хештегів в кінці
- Емодзі — тільки якщо автор їх використовує в прикладах. Якщо прикладів немає — максимум 2-3

ЯК НЕ ПИСАТИ (це дуже важливо):
- Без "Уявіть собі", "Давайте розберемось", "В сучасному світі", "Нещодавно задумався"
- Без канцеляризмів: "вищезазначений", "у зв'язку з цим", "на мою думку" (на початку)
- Без слів: "інноваційний", "трансформація", "парадигма", "синергія", "масштабування", "оптимізація" (крім IT)
- Без шаблону "Питання → відповідь → питання → відповідь" — це одразу видає AI
- Без перерахування "1. 2. 3." якщо це не списки порад
- Без фейкових історій "Мій друг колись..." — якщо це не тип "Історія"
- Без мотиваційного пафосу "Кожен може!", "Вірте в себе!"
- Звучи як людина яка просто пише пост, а не як маркетолог який оптимізує engagement

ГОЛОВНЕ: Пост має звучати так, ніби його написала реальна людина за 10 хвилин, а не згенерувала AI за 2 секунди. Живо, просто, конкретно.

Стаття: {article_title}

{article_content[:5000]}{research_block}

Тільки текст посту, нічого більше."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return response.text
