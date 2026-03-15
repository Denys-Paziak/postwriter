"""
GenerationCrew — six-agent crew for LinkedIn post generation.

Agents (sequential):
  1. ContentStrategist — picks angle and plans post structure
  2. Copywriter        — writes first draft using tone instructions
  3. VoiceEditor       — rewrites to match author profile
  4. HumanityEditor    — final pass to remove AI patterns
  5. QualityCritic     — red-teams the draft and lists concrete gaps
  6. QualityReviewer   — applies critique and produces the publish-ready post

Imports _TONE_INSTRUCTIONS from services.gemini — single source of truth.
Queue/thread pattern identical to crew_research.py.
"""

import os
import re
import threading
from queue import Queue

from crewai import Agent, Crew, LLM, Process, Task

from services.gemini import _TONE_INSTRUCTIONS

_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA70-\U0001FAFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]"
)


def _make_llm(api_key: str | None = None) -> LLM:
    """Create the LLM instance used by all generation agents."""
    return LLM(
        model="gemini/gemini-2.5-flash",
        api_key=api_key or os.environ.get("GEMINI_API_KEY"),
    )


def _rough_word_count(text: str) -> int:
    """Return a rough Unicode-aware word count for prompt heuristics."""
    return len(re.findall(r"\w+", text, flags=re.UNICODE))


def _summarize_style_signals(example_posts: list[str]) -> str:
    """Extract simple, deterministic style cues from the author's example posts."""
    samples = [post.strip() for post in example_posts if post and post.strip()][:3]
    if not samples:
        return ""

    joined = "\n".join(samples)
    total_words = _rough_word_count(joined)
    sentence_chunks = [
        chunk.strip()
        for post in samples
        for chunk in re.split(r"[.!?]+", post)
        if chunk.strip()
    ]
    sentence_count = max(len(sentence_chunks), 1)
    avg_sentence_words = total_words / sentence_count
    avg_paragraphs = sum(
        max(len([line for line in post.splitlines() if line.strip()]), 1)
        for post in samples
    ) / len(samples)
    avg_hashtags = sum(len(re.findall(r"#\w+", post, flags=re.UNICODE)) for post in samples) / len(samples)
    question_count = joined.count("?")
    exclamation_count = joined.count("!")
    emoji_count = len(_EMOJI_RE.findall(joined))

    if avg_sentence_words <= 9:
        sentence_style = "короткі й рубані"
    elif avg_sentence_words <= 16:
        sentence_style = "помірної довжини"
    else:
        sentence_style = "довгі й розгорнуті"

    if emoji_count == 0:
        emoji_style = "Емодзі не використовує."
    elif emoji_count <= len(samples) * 2:
        emoji_style = "Емодзі використовує стримано, поодиноко."
    else:
        emoji_style = "Емодзі використовує помітно, це частина голосу."

    if avg_hashtags < 1:
        hashtag_style = "Хештеги майже не використовує."
    else:
        hashtag_style = f"Хештегів зазвичай близько {round(avg_hashtags)} на пост."

    if question_count == 0:
        question_style = "Риторичні питання майже не використовує."
    elif question_count <= len(samples):
        question_style = "Риторичні питання трапляються інколи."
    else:
        question_style = "Питання — помітний ритмічний інструмент автора."

    if exclamation_count == 0:
        energy_style = "Тон стриманий, без окличної емоційності."
    elif exclamation_count <= len(samples):
        energy_style = "Є точкові окличні акценти, але без перегину."
    else:
        energy_style = "Тон енергійний, з вираженими емоційними акцентами."

    return "\n".join([
        f"- Речення переважно {sentence_style} (приблизно {round(avg_sentence_words)} слів).",
        f"- У середньому {avg_paragraphs:.1f} абзаци на пост, тримай короткі блоки.",
        f"- {emoji_style}",
        f"- {hashtag_style}",
        f"- {question_style}",
        f"- {energy_style}",
    ])


def _build_author_context(author: dict | None) -> str:
    """Build a prompt block that captures the author's non-negotiable style signals."""
    if not author:
        return ""
    parts = []
    if author.get("name"):
        parts.append(f"АВТОР: {author['name']}")
    if author.get("expertise"):
        parts.append(f"ЕКСПЕРТИЗА АВТОРА: {author['expertise']}")
    if author.get("preferred_tone"):
        parts.append(f"БАЗОВИЙ ТОН АВТОРА У ПРОФІЛІ: {author['preferred_tone']}")
    if author.get("about"):
        parts.append(f"ПРО АВТОРА: {author['about']}")
    if author.get("avoid_words"):
        parts.append(f"НІКОЛИ НЕ ВИКОРИСТОВУЙ ці слова/фрази: {author['avoid_words']}")
    example_posts = author.get("example_posts") or []
    if example_posts:
        parts.append("РЕАЛЬНІ ПОСТИ АВТОРА — твій пост має звучати ТАК САМО:")
        for i, post in enumerate(example_posts[:3]):
            parts.append(f"--- Приклад {i + 1} ---\n{post[:1500]}")
        parts.append("---")
        style_signals = _summarize_style_signals(example_posts)
        if style_signals:
            parts.append(f"СТИЛЬОВІ СИГНАЛИ НА ОСНОВІ ПРИКЛАДІВ:\n{style_signals}")
        parts.append(
            "Копіюй із прикладів: довжину речень, лексику, структуру, рівень емодзі, "
            "ступінь формальності. Якщо автор пише коротко — пиши коротко. "
            "Якщо без емодзі — без емодзі. Якщо з гумором — з гумором."
        )
        parts.append(
            "Якщо загальні поради по тону конфліктують з реальними прикладами автора, "
            "пріоритет мають приклади автора. Виняток: фактична точність і заборонені слова."
        )
    return "\n".join(parts)


def _build_crew(queue: Queue, tone: str, author: dict | None) -> Crew:
    llm = _make_llm(api_key=author.get("gemini_api_key") if author else None)
    tone_block = _TONE_INSTRUCTIONS.get(tone, _TONE_INSTRUCTIONS["value"])
    author_context = _build_author_context(author)
    author_block = f"ПРОФІЛЬ АВТОРА:\n{author_context}\n\n" if author_context else ""

    # ------------------------------------------------------------------
    # Agent 1: ContentStrategist
    # ------------------------------------------------------------------
    strategist = Agent(
        role="Контент-стратег для LinkedIn",
        goal=(
            "Прочитати статтю та дослідження аудиторії, вибрати найсильніший кут подачі "
            "та визначити структуру майбутнього посту."
        ),
        backstory=(
            "Ти досвідчений контент-стратег, що спеціалізується на LinkedIn. "
            "Ти читаєш статті та дослідження і одразу бачиш, яка думка чи інсайт "
            "найбільше резонуватиме з аудиторією. "
            "Ти не пишеш пост — ти визначаєш стратегію: головну тезу, "
            "хук першого речення, структуру тіла та заклик до дії."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 2: Copywriter
    # ------------------------------------------------------------------
    copywriter = Agent(
        role="Копірайтер LinkedIn-постів",
        goal=(
            "Написати чорновик LinkedIn-посту на основі стратегії, "
            "дотримуючись заданого тону та правил написання."
        ),
        backstory=(
            "Ти майстерний копірайтер, що пише виключно українською. "
            "Ти пишеш живо, конкретно, без кліше та AI-шаблонів. "
            "Твої пости звучать як від реальної людини — не від маркетолога. "
            "Ти суворо дотримуєшся інструкцій щодо стилю та забороненого словника."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 3: VoiceEditor
    # ------------------------------------------------------------------
    voice_editor = Agent(
        role="Редактор авторського голосу",
        goal="Переписати пост так, щоб він звучав як цей конкретний автор.",
        backstory=(
            "Ти редактор з унікальною здатністю копіювати авторський стиль. "
            "Ти аналізуєш приклади постів автора і відтворюєш їх манеру: "
            "довжину речень, лексику, кількість емодзі, рівень формальності, структуру. "
            "Якщо автор пише коротко — ти пишеш коротко. "
            "Якщо без емодзі — без емодзі. Якщо з гумором — з гумором."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 4: HumanityEditor
    # ------------------------------------------------------------------
    humanity_editor = Agent(
        role="Редактор природності тексту",
        goal="Зробити фінальний пост абсолютно природним, видалити всі AI-патерни.",
        backstory=(
            "Ти провідний редактор, який знає всі патерни AI-тексту напам'ять. "
            "Ти бачиш: рівну щільність слів без пауз (AI пише однотипно), "
            "перехідні слова-паразити ('Отже', 'Варто зазначити', 'Таким чином'), "
            "фальшиву конкретику без деталей, нульовий перепад довжини речень. "
            "Люди пишуть інакше: дуже короткі речення. І дуже довгі, де думка "
            "розгортається і продовжується через кому, бо думка так працює. "
            "Люди роблять паузи. І повертаються до думки. "
            "Ти повністю переписуєш де потрібно."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 5: QualityCritic
    # ------------------------------------------------------------------
    quality_critic = Agent(
        role="Ред-тим рецензент контенту",
        goal="Знайти слабкі місця посту й описати, що саме треба виправити перед публікацією.",
        backstory=(
            "Ти прискіпливий редактор, який не пише дипломатично. "
            "Ти не хвалиш текст за замовчуванням, а шукаєш де він втрачає фактичність, "
            "авторський голос, користь для аудиторії або людяність. "
            "Ти формуєш чіткий план виправлень, щоб фінальний редактор не гадав, а діяв."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 6: QualityReviewer
    # ------------------------------------------------------------------
    quality_reviewer = Agent(
        role="Контент-менеджер і фінальний рецензент",
        goal="Випустити публікабельний пост, акуратно застосувавши зауваження критика.",
        backstory=(
            "Ти фінальний редактор LinkedIn-контенту. "
            "Ти не просто поліруєш текст, а приводиш його до стану publish-ready: "
            "залишаєш факти, додаєш чіткість, тримаєш авторський голос і не пропускаєш "
            "банальності чи AI-смак. Якщо критика серйозна — ти переписуєш сміливо."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Task 1: Strategy
    # ------------------------------------------------------------------
    strategy_task = Task(
        description=(
            f"Прочитай статтю та дослідження аудиторії. "
            f"Визнач найсильніший кут подачі для LinkedIn-посту у тоні: {tone}.\n\n"
            f"Опис тону:\n{tone_block}\n\n"
            f"{author_block}"
            "Стаття: {title}\n\n{content}\n\n"
            "Дослідження аудиторії:\n{research}\n\n"
            "Визнач: 1) головну тезу/інсайт, 2) хук першого речення (не питання, "
            "не «Уявіть собі»), 3) структуру тіла (3-4 пункти), 4) заклик до дії. "
            "Обирай кут, який одночасно резонує з аудиторією й природний саме для цього автора."
        ),
        expected_output=(
            "Стратегічний бриф: головна теза, хук, структура тіла, заклик до дії. "
            "Не сам пост — лише план. Українською мовою."
        ),
        agent=strategist,
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Стратег визначив кут подачі, копірайтер пише чорновик...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 2: First draft
    # ------------------------------------------------------------------
    copywriting_task = Task(
        description=(
            f"Напиши чорновик LinkedIn-посту на основі стратегічного брифу.\n\n"
            f"Тон:\n{tone_block}\n\n"
            f"{author_block}"
            "ФАКТИЧНА ОСНОВА:\n"
            "Стаття: {title}\n{content}\n\n"
            "Дослідження аудиторії:\n{research}\n\n"
            "ПРАВИЛА НАПИСАННЯ:\n"
            "- Від першої особи\n"
            "- Короткі абзаци, 1-2 речення\n"
            "- Перше речення — хук (не питання, не «Уявіть собі»)\n"
            "- 150-250 слів\n"
            "- 3-5 хештегів в кінці\n"
            "- Максимум 2-3 емодзі якщо немає прикладів автора\n"
            "- Мінімум 2 конкретні ідеї, факти або формулювання мають явно спиратись на статтю чи research\n"
            "- Не вигадуй фактів, яких немає у статті або research\n\n"
            "ЗАБОРОНЕНО:\n"
            "- «Уявіть собі», «Давайте розберемось», «В сучасному світі»\n"
            "- Канцеляризми та пафос\n"
            "- Слова: інноваційний, трансформація, парадигма, синергія\n"
            "- Шаблон «питання → відповідь → питання»\n"
            "- Нумеровані списки крім порад\n"
            "- Мотиваційний пафос типу «Кожен може!»\n\n"
            "Якщо приклади автора суперечать загальним правилам стилю, "
            "дотримуйся прикладів автора, але не порушуй фактичність і заборони."
        ),
        expected_output=(
            "Готовий чорновик LinkedIn-посту. Українською. 150-250 слів. "
            "Хештеги в кінці. Живо і природно."
        ),
        agent=copywriter,
        context=[strategy_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Чорновик готовий, редактор адаптує під авторський голос...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 3: Voice adaptation
    # ------------------------------------------------------------------
    voice_task = Task(
        description=(
            "Переписати чорновик під авторський стиль.\n\n"
            + (
                f"{author_context}\n\n"
                if author_context else
                "Профіль автора не надано — зберігай стиль чорновика без змін.\n\n"
            )
            + "Якщо надані приклади постів автора — точно відтворюй їх манеру. "
            "Змінюй лексику, ритм, паузи, емодзі, градус розмовності. "
            "Не змінюй факти зі статті, не викидай корисні інсайти з research "
            "і не повертай заборонені слова."
        ),
        expected_output=(
            "Пост переписаний у стилі автора. Той самий зміст, "
            "але звучить як цей конкретний автор. Тільки текст посту."
        ),
        agent=voice_editor,
        context=[copywriting_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Голос налаштовано, фінальний редактор перевіряє природність...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 4: Humanity pass
    # ------------------------------------------------------------------
    humanity_task = Task(
        description=(
            "Зроби текст максимально людським. Ти маєш ПРАВО на повне переписування якщо потрібно.\n\n"
            f"{author_block}"
            "КОНТЕКСТ, ЯКИЙ НЕ МОЖНА ВТРАТИТИ:\n"
            "Стаття: {title}\n{content}\n\n"
            "Дослідження аудиторії:\n{research}\n\n"
            "ПЕРЕВІРКА AI-ПАТЕРНІВ (заборонені — видали або заміни):\n"
            "- Перехідники: «Отже», «Таким чином», «На закінчення», «Варто зазначити», «Важливо зрозуміти»\n"
            "- Список-шаблон: кожен абзац однакової довжини\n"
            "- Фальшива конкретика: «декілька ключових моментів», «важливий аспект»\n"
            "- Рівна щільність: всі речення 15-20 слів (AI-ознака)\n"
            "- Кліше-сигнали: «у сучасному світі», «якніколи раніше», «на новий рівень»\n"
            "- Механічний хук: перше речення занадто «правильне» і відшліфоване\n\n"
            "ЗРОБИ ТЕКСТ ЛЮДСЬКИМ:\n"
            "- Різка варіація довжини речень. Одне коротке. Потім довге де думка йде далі і не обривається штучно.\n"
            "- Додай 1-2 непередбачувані переходи: «До речі,», «Хоча...», «Але от що дивно —»\n"
            "- Хук має звучати як думка вголос, не як рекламний слоган\n"
            "- Дозволені легкі розмовні конструкції: «кароч», «от», «чесно кажучи», «якщо чесно»\n"
            "- Уникай: 3 підряд речення з підметом-іменником на початку\n\n"
            "ПІСЛЯ ПРАВКИ ПЕРЕВІР:\n"
            "- Чи збережені факти зі статті та інсайти з research?\n"
            "- Чи не зламався авторський голос?\n"
            "- Чи можна прочитати уголос без почуття «це AI»?\n"
            "- Чи є хоч одне несподіване слово / зворот?\n"
            "- Чи різна довжина речень (min: 3-5 слів, max: 25+ слів)?\n"
            "- Word count 150-250 зберігається?\n\n"
            "Тільки текст посту. Нічого більше."
        ),
        expected_output=(
            "Пост з виправленими AI-патернами. Тільки текст — без пояснень, "
            "без «Ось пост:», без метакоментарів."
        ),
        agent=humanity_editor,
        context=[voice_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Природність вичищено, критик шукає слабкі місця...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 5: Quality critique
    # ------------------------------------------------------------------
    critique_task = Task(
        description=(
            f"Оціни фінальний пост максимально критично. Твоя задача — знайти, де він слабкий.\n\n"
            f"ОРИГІНАЛЬНА СТАТТЯ: {{title}}\n{{content}}\n\n"
            "ДОСЛІДЖЕННЯ АУДИТОРІЇ:\n{research}\n\n"
            f"ЗАДАНИЙ ТОН: {tone}\n{tone_block}\n\n"
            f"{author_block}"
            "ПЕРЕВІР:\n"
            "- Чи є конкретні факти/ідеї зі статті, а не загальні слова\n"
            "- Чи використано релевантні інсайти з research, якщо він наданий\n"
            "- Чи відчувається авторський голос, а не generic AI-стиль\n"
            "- Чи не повернулися avoid_words або штампи\n"
            "- Чи є сильний хук, варіативний ритм і нормальний word count\n\n"
            "ПОВЕРНИ РЕЗУЛЬТАТ СУВОРО У ФОРМАТІ:\n"
            "VERDICT: PASS або FAIL\n"
            "SCORE: x/10\n"
            "FACT CHECK:\n- ...\n"
            "RESEARCH CHECK:\n- ...\n"
            "VOICE CHECK:\n- ...\n"
            "AI PATTERNS:\n- ...\n"
            "REVISION PLAN:\n1. ...\n2. ...\n3. ...\n\n"
            "Якщо текст добрий, все одно дай 2-3 точкові правки у REVISION PLAN."
        ),
        expected_output=(
            "Структурована критика з вердиктом, оцінкою й конкретним планом правок. "
            "Не переписуй сам пост у цьому кроці."
        ),
        agent=quality_critic,
        context=[strategy_task, humanity_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Критик залишив зауваження, фінальний редактор допрацьовує пост...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 6: Quality review
    # ------------------------------------------------------------------
    review_task = Task(
        description=(
            f"Підготуй фінальну версію посту до публікації.\n\n"
            f"ОРИГІНАЛЬНА СТАТТЯ: {{title}}\n{{content}}\n\n"
            "ДОСЛІДЖЕННЯ АУДИТОРІЇ:\n{research}\n\n"
            f"ЗАДАНИЙ ТОН: {tone}\n{tone_block}\n\n"
            f"{author_block}"
            "ТВОЯ ЗАДАЧА:\n"
            "- уважно врахувати structured critique\n"
            "- якщо VERDICT=FAIL або SCORE < 8/10 — суттєво переписати текст, а не косметично підчистити\n"
            "- якщо VERDICT=PASS — зробити лише потрібні точкові фінальні правки\n"
            "- не втратити конкретні факти зі статті та корисні інсайти з research\n"
            "- не зламати авторський голос і не повертати заборонені слова\n"
            "- не вигадувати нових фактів або тез, яких немає у статті чи research\n\n"
            "ФІНАЛЬНИЙ ЧЕКЛІСТ:\n"
            "1. 150-250 слів\n"
            "2. 3-5 хештегів наприкінці\n"
            "3. Перший рядок — сильний хук, не шаблонний\n"
            "4. Текст звучить як людина і як цей автор\n"
            "5. У тексті є реальна опора на статтю та research\n\n"
            "На виході — тільки готовий пост. Без пояснень, без чекліста, без метакоментарів."
        ),
        expected_output=(
            "Фінальний пост готовий до публікації. Тільки текст — без пояснень, "
            "без «Ось пост:», без метакоментарів."
        ),
        agent=quality_reviewer,
        context=[humanity_task, critique_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Фінальний редактор інтегрував зауваження, пост готовий...",
        }),
    )

    return Crew(
        agents=[
            strategist,
            copywriter,
            voice_editor,
            humanity_editor,
            quality_critic,
            quality_reviewer,
        ],
        tasks=[
            strategy_task,
            copywriting_task,
            voice_task,
            humanity_task,
            critique_task,
            review_task,
        ],
        process=Process.sequential,
        verbose=True,
    )


def run_generation_crew(
    article_title: str,
    article_content: str,
    tone: str,
    research: str | None,
    author: dict | None,
) -> Queue:
    """
    Launch GenerationCrew in a daemon thread.

    Returns a Queue emitting:
      {"type": "progress", "message": str}
      {"type": "result",   "data": str}      ← final post text
      {"type": "error",    "message": str}
      None                                    ← sentinel
    """
    queue: Queue = Queue()

    def _run() -> None:
        try:
            crew = _build_crew(queue, tone, author)
            result = crew.kickoff(inputs={
                "title": article_title,
                "content": article_content[:6000],
                "research": (research or "Дослідження не проводилось.")[:3000],
            })
            queue.put({"type": "result", "data": str(result)})
        except Exception as exc:
            queue.put({"type": "error", "message": str(exc)})
        finally:
            queue.put(None)

    threading.Thread(target=_run, daemon=True).start()
    return queue
