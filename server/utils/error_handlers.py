"""
Centralized AI error formatter.
Translates technical exceptions into clear, user-friendly Ukrainian messages.
"""

import re


def format_ai_error(e: Exception | str) -> str:
    """
    Translate AI service exceptions into user-friendly Ukrainian messages.
    Falls back to a cleaned version of the original message if unrecognized.
    """
    msg = str(e)

    # 429 / quota exceeded
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota exceeded" in msg.lower() or "rate limit" in msg.lower():
        return (
            "Перевищено ліміт запитів до AI. "
            "Зачекайте 30–60 секунд і спробуйте знову. "
            "Щоб уникнути цього — додайте власний API ключ у налаштуваннях."
        )

    # Auth / API key issues
    if "api_key" in msg.lower() or "401" in msg or "PERMISSION_DENIED" in msg or "invalid key" in msg.lower():
        return "Помилка авторизації в AI. Перевірте або оновіть API ключ у налаштуваннях."

    # Timeout / server unavailable
    if "timeout" in msg.lower() or "deadline" in msg.lower() or "timed out" in msg.lower():
        return "AI не відповідає вчасно. Спробуйте ще раз за хвилину."

    # Model not found
    if "not found" in msg.lower() and ("model" in msg.lower() or "404" in msg):
        return "Модель AI недоступна. Можливо, вказаний ключ не має доступу до цієї моделі."

    # Network / connection errors
    if "connection" in msg.lower() or "network" in msg.lower() or "503" in msg or "502" in msg:
        return "Сервіс AI тимчасово недоступний. Перевірте інтернет-з'єднання та спробуйте знову."

    # Fallback: clean up raw Python/JSON noise from the message
    # Remove JSON chunks like ", {'error': ...}"
    cleaned = re.split(r",\s*\{['\"]", msg)[0].strip()
    # Remove long stack-trace-like lines
    if len(cleaned) > 300:
        cleaned = cleaned[:300] + "..."
    # Avoid leaking raw Python tracebacks
    if "Traceback" in cleaned or "File \"/" in cleaned:
        return "Сталася невідома помилка. Перевірте логи сервера."

    return cleaned
