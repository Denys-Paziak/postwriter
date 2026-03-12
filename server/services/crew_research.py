"""
ResearchCrew — two-agent crew for real audience research.

Agents (sequential):
  1. WebResearcher   — searches the web for real audience discussions using GeminiSearchTool
  2. ResearchAnalyst — synthesises raw findings into a structured Ukrainian report

The crew runs in a daemon thread; a Queue bridges the blocking crew
thread to the async FastAPI SSE generator via run_in_executor.
"""

import os
import threading
from queue import Queue

from crewai import Agent, Crew, LLM, Process, Task

from tools.gemini_search import GeminiSearchTool


def _make_llm(api_key: str | None = None) -> LLM:
    return LLM(
        model="gemini/gemini-2.5-flash",
        api_key=api_key or os.environ.get("GEMINI_API_KEY"),
    )


def _build_crew(queue: Queue, api_key: str | None = None) -> Crew:
    llm = _make_llm(api_key)
    search_tool = GeminiSearchTool()

    # ------------------------------------------------------------------
    # Agent 1: WebResearcher
    # ------------------------------------------------------------------
    web_researcher = Agent(
        role="Веб-дослідник аудиторії",
        goal=(
            "Знайти реальні обговорення, питання, думки та проблеми аудиторії "
            "стосовно заданої теми, використовуючи пошук в інтернеті."
        ),
        backstory=(
            "Ти досвідчений дослідник соціальних медіа. "
            "Ти вмієш знаходити справжні голоси аудиторії: питання на Reddit та Quora, "
            "дискусії у форумах, коментарі у блогах. "
            "Ти завжди спираєшся на реальні джерела, а не на власні припущення. "
            "Коли знаходиш щось цікаве — копаєш глибше."
        ),
        tools=[search_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=4,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Agent 2: ResearchAnalyst
    # ------------------------------------------------------------------
    research_analyst = Agent(
        role="Аналітик контент-досліджень",
        goal=(
            "Перетворити сирі результати пошуку на структурований звіт про аудиторію "
            "у форматі, придатному для написання LinkedIn-посту."
        ),
        backstory=(
            "Ти стратегічний аналітик контенту зі спеціалізацією на LinkedIn. "
            "Ти читаєш хаотичні дані і перетворюєш їх на чіткі інсайти. "
            "Твої звіти завжди конкретні, без «води», орієнтовані на практику. "
            "Ти пишеш виключно українською мовою."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        memory=False,
    )

    # ------------------------------------------------------------------
    # Task 1: Web search
    # ------------------------------------------------------------------
    search_task = Task(
        description=(
            "Проведи пошук в інтернеті за темою статті.\n\n"
            "Заголовок: {title}\n\n"
            "Фрагмент статті:\n{content}\n\n"
            "Знайди реальні обговорення, питання, думки людей стосовно цієї теми. "
            "Шукай на форумах, Reddit, Quora, у коментарях до статей. "
            "Виконай 2-3 різних пошукових запити, щоб охопити різні аспекти теми."
        ),
        expected_output=(
            "Список реальних знахідок з інтернету: питання які задають люди, "
            "думки/позиції, проблеми, поради, спірні моменти. "
            "Не менше 15-20 окремих спостережень. Без структурування — просто сирі дані."
        ),
        agent=web_researcher,
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Веб-дослідник знайшов матеріали, аналітик структурує звіт...",
        }),
    )

    # ------------------------------------------------------------------
    # Task 2: Synthesis
    # ------------------------------------------------------------------
    analysis_task = Task(
        description=(
            "Проаналізуй знахідки дослідника і склади структурований звіт.\n\n"
            "Заголовок статті: {title}\n\n"
            "Використай ТОЧНО такий формат:\n\n"
            "🔍 КЛЮЧОВІ ПИТАННЯ АУДИТОРІЇ\n"
            "- [питання 1]\n"
            "- [питання 2]\n"
            "(3-5 питань)\n\n"
            "💬 ТИПОВІ ДУМКИ ТА ПОЗИЦІЇ\n"
            "- [думка 1]\n"
            "(3-5 думок)\n\n"
            "⚡ БОЛЬОВІ ТОЧКИ\n"
            "- [проблема 1]\n"
            "(2-4 проблеми)\n\n"
            "💡 ПОПУЛЯРНІ ПОРАДИ ТА РЕКОМЕНДАЦІЇ\n"
            "- [порада 1]\n"
            "(3-5 порад)\n\n"
            "🔥 СПІРНІ МОМЕНТИ\n"
            "- [момент 1]\n"
            "(2-3 пункти)"
        ),
        expected_output=(
            "Структурований звіт у форматі вище. "
            "Українською мовою. Конкретно, без «води». "
            "Базується виключно на знахідках дослідника."
        ),
        agent=research_analyst,
        context=[search_task],
        callback=lambda _: queue.put({
            "type": "progress",
            "message": "Аналітик склав звіт, зберігаємо результат...",
        }),
    )

    return Crew(
        agents=[web_researcher, research_analyst],
        tasks=[search_task, analysis_task],
        process=Process.sequential,
        verbose=True,
    )


def run_research_crew(article_title: str, article_content: str, api_key: str | None = None) -> Queue:
    """
    Launch ResearchCrew in a daemon thread.

    Returns a Queue that emits dicts:
      {"type": "progress", "message": str}
      {"type": "result",   "data": str}      ← final research text
      {"type": "error",    "message": str}
      None                                    ← sentinel, stream is done
    """
    queue: Queue = Queue()

    def _run() -> None:
        try:
            crew = _build_crew(queue, api_key)
            result = crew.kickoff(inputs={
                "title": article_title,
                "content": article_content[:4000],
            })
            queue.put({"type": "result", "data": str(result)})
        except Exception as exc:
            queue.put({"type": "error", "message": str(exc)})
        finally:
            queue.put(None)  # sentinel — always sent

    threading.Thread(target=_run, daemon=True).start()
    return queue
