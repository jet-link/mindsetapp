"""Определяет язык запроса по ``Accept-Language`` и публикует его.

Кладёт код языка в ``request.language`` и в contextvar (через
``set_current_language``), чтобы ``t()`` работал и в слоях без request.
"""
from __future__ import annotations

from . import normalize_language, set_current_language


class LanguageMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
        first = header.split(',')[0] if header else ''
        lang = normalize_language(first)
        request.language = lang
        set_current_language(lang)
        return self.get_response(request)
