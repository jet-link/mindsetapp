"""Кулдауны на создание контента (анти-спам/анти-бот).

Глобальный DRF-троттлинг (60/300 req/min) остаётся как грубый предохранитель.
Здесь — точечные лимиты на создание тем/ответов: минимальный интервал между
действиями + потолок за скользящий час. Состояние храним в Redis (Django cache).

Реализовано функцией, а не DRF-троттлом, осознанно: троттл отдаёт 429, и браузер
пишет в консоль 'Failed to load resource: 429'. Вместо этого view возвращает 200
со структурой {ok: false, cooldown: true, retry_after}, а фронт сам блокирует
кнопку с обратным отсчётом.
"""
from __future__ import annotations

import time

from django.core.cache import cache

# Конфиги кулдаунов: интервал между действиями + лимит за час.
THEME_COOLDOWN = {'scope': 'theme_create', 'min_interval': 30, 'hourly_cap': 10}
REPLY_COOLDOWN = {'scope': 'reply_create', 'min_interval': 10, 'hourly_cap': 30}


def cooldown_retry_after(
    user,
    *,
    scope: str,
    min_interval: int = 0,
    hourly_cap: int | None = None,
    record: bool = True,
    target: str | None = None,
) -> int:
    """Сколько секунд осталось ждать (0 — действие разрешено).

    При ``record=True`` и разрешённом действии фиксирует факт действия в кэше.
    Анонимов не лимитируем — их и так отсекают permission-классы.

    ``target`` (например, ``theme:5`` / ``reply:12``) делает короткий
    ``min_interval`` точечным: ответ одной теме/ответу не блокирует другие.
    Часовой потолок (``hourly_cap``) при этом остаётся общим на пользователя —
    это и есть реальная анти-спам защита.
    """
    if not user or not user.is_authenticated:
        return 0

    now = time.time()
    ident = user.pk
    last_ident = f'{ident}:{target}' if target else f'{ident}'
    last_key = f'cooldown:{scope}:last:{last_ident}'
    hist_key = f'cooldown:{scope}:hist:{ident}'

    # 1) Минимальный интервал между действиями.
    if min_interval:
        last = cache.get(last_key)
        if last is not None:
            elapsed = now - last
            if elapsed < min_interval:
                return int(min_interval - elapsed) + 1

    # 2) Потолок за скользящий час.
    history = cache.get(hist_key) or []
    if hourly_cap is not None:
        window_start = now - 3600
        history = [t for t in history if t > window_start]
        if len(history) >= hourly_cap:
            oldest = min(history)
            return int(oldest + 3600 - now) + 1

    # Фиксируем успешное действие.
    if record:
        if min_interval:
            cache.set(last_key, now, timeout=min_interval)
        if hourly_cap is not None:
            history.append(now)
            cache.set(hist_key, history, timeout=3600)
    return 0
