"""Текстовые утилиты (портировано из liveblog smart_blog/utils.py)."""
from __future__ import annotations

import math
import re


def count_convert(n: int) -> str:
    """1234 → '1.2K', как на YouTube."""
    if n < 1000:
        return str(n)
    for value, suffix in [(1_000_000_000, 'B'), (1_000_000, 'M'), (1_000, 'K')]:
        if n >= value:
            res = n / value
            if res >= 10:
                return f'{int(res)}{suffix}'
            truncated = math.floor(res * 10) / 10
            return f'{truncated:.1f}'.rstrip('0').rstrip('.') + suffix
    return str(n)


def human_time_relative(dt, *, now=None) -> str:
    """Короткие относительные метки: Right now, N min ago, N hr ago, N mo ago."""
    from django.utils import timezone as dj_tz

    if dt is None:
        return ''
    if now is None:
        now = dj_tz.now()
    if dj_tz.is_naive(dt):
        dt = dj_tz.make_aware(dt, dj_tz.get_current_timezone())
    if dj_tz.is_naive(now):
        now = dj_tz.make_aware(now, dj_tz.get_current_timezone())

    secs = int((now - dt).total_seconds())
    if secs < 60:
        return 'Right now'

    mins = secs // 60
    if mins < 60:
        return '1 min ago' if mins == 1 else f'{mins} min ago'

    hours = mins // 60
    if hours < 24:
        return '1 hr ago' if hours == 1 else f'{hours} hr ago'

    days = hours // 24
    if days < 7:
        return '1 day ago' if days == 1 else f'{days} days ago'
    if days < 30:
        wks = days // 7
        return '1 wk ago' if wks == 1 else f'{wks} wk ago'
    if days < 365:
        mo = max(1, days // 30)
        return '1 mo ago' if mo == 1 else f'{mo} mo ago'

    yrs = days // 365
    return '1 yr ago' if yrs == 1 else f'{yrs} yr ago'


def html_to_plain_text(html: str) -> str:
    """Дешевая проекция HTML → текст для превью и поиска."""
    if not html:
        return ''
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.I)
    text = re.sub(r'</p>\s*<p[^>]*>', '\n\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


THEME_BODY_MAX_LEN = 500


def normalize_theme_body(text: str) -> str:
    """\\r\\n и \\r → \\n; каждый перенос строки = 1 символ."""
    return (text or '').replace('\r\n', '\n').replace('\r', '\n')


def theme_body_length(text: str) -> int:
    return len(normalize_theme_body(text))
