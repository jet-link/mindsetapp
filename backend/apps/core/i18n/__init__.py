"""Минимальный i18n для API-ответов.

Сообщения об ошибках/системные строки переводятся через ``t(key, lang)`` с
fallback на английский. Активный язык запроса определяется ``LanguageMiddleware``
по заголовку ``Accept-Language`` и хранится в contextvar (доступен из services,
где нет ссылки на request).
"""
from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_LANGUAGE = 'en'
SUPPORTED_LANGUAGES = ('en', 'ru', 'uz')

_LOCALES_DIR = Path(__file__).resolve().parent / 'locales'
_cache: dict[str, dict[str, str]] = {}
_current_language: ContextVar[str] = ContextVar(
    'current_language', default=DEFAULT_LANGUAGE,
)


def normalize_language(lang: str | None) -> str:
    """Любой ввод (``ru-RU``, ``UZ``, None) → один из поддерживаемых кодов."""
    if not lang:
        return DEFAULT_LANGUAGE
    code = lang.strip().lower()[:2]
    return code if code in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def set_current_language(lang: str | None) -> None:
    _current_language.set(normalize_language(lang))


def get_current_language() -> str:
    return _current_language.get()


def _load(lang: str) -> dict[str, str]:
    cached = _cache.get(lang)
    if cached is not None:
        return cached
    path = _LOCALES_DIR / lang / 'errors.json'
    data: dict[str, str] = {}
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        logger.warning('i18n: locale file missing: %s', path)
    _cache[lang] = data
    return data


def t(key: str, lang: str | None = None, **params) -> str:
    """Перевод по ключу с интерполяцией ``{param}`` и fallback на английский."""
    lang = normalize_language(lang or get_current_language())
    template = _load(lang).get(key)
    if template is None and lang != DEFAULT_LANGUAGE:
        template = _load(DEFAULT_LANGUAGE).get(key)
    if template is None:
        logger.warning('i18n: missing translation key %r (lang=%s)', key, lang)
        return key
    if params:
        try:
            return template.format(**params)
        except (KeyError, IndexError):
            return template
    return template
