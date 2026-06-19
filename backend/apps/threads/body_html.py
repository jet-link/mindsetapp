"""Рендер body для Theme/Reply (перенос из liveblog mindset/body_html.py).

Санитизация + linkify URL + хэштеги → ссылки на фронтовый роут
(settings.MINDSET_TAG_URL_TEMPLATE) + YouTube-ссылки → ссылка + iframe.
"""
from __future__ import annotations

import html as html_module
import re
from typing import Iterable
from urllib.parse import parse_qs, urlparse

from django.conf import settings
from django.utils.html import escape
from django.utils.text import slugify

from apps.core.sanitize import sanitize_and_linkify_html

# @username — ссылка на профиль (как в Threads).
# Символы как в Django UnicodeUsernameValidator: буквы, цифры, @ . + - _
# В [] тире только как \\- или в конце, иначе +-.@/ даёт диапазон, включающий '>'.
_USERNAME_CHARS = r'A-Za-z0-9_.+@\-'
_MENTION_BEFORE = r'A-Za-z0-9_.+@\-/'
_MENTION_RE = re.compile(
    rf'(?<![{_MENTION_BEFORE}])@'
    rf'([A-Za-z0-9](?:[{_USERNAME_CHARS}]{{0,148}}[A-Za-z0-9])?)'
)

# #word без буквы/цифры перед # (не ловим "abc#tag" и CSS hex вроде "#ff0").
_HASHTAG_RE = re.compile(r'(?<![\w&])#([A-Za-zА-Яа-яЁё0-9_]{1,64})')

# Внутри существующего <a> хэштеги не подменяем.
_ANCHOR_BLOCK_RE = re.compile(r'<a\b[^>]*>.*?</a>', re.I | re.DOTALL)

# Простой текст (без HTML-тегов) — переносы строк сохраняем как <br>/<p>.
_HTML_TAG_RE = re.compile(r'<[a-zA-Z!/]')


def _looks_like_html(text: str) -> bool:
    return bool(_HTML_TAG_RE.search(text))


def plain_text_to_html(text: str) -> str:
    """Один \\n → <br>, пустая строка (двойной \\n) → новый абзац <p>."""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    if not text.strip():
        return ''
    paragraphs = re.split(r'\n\n+', text)
    blocks: list[str] = []
    for para in paragraphs:
        lines = para.split('\n')
        inner = '<br>'.join(escape(line) for line in lines)
        blocks.append(f'<p>{inner}</p>')
    return ''.join(blocks)


def _tag_url(slug: str) -> str:
    return settings.MINDSET_TAG_URL_TEMPLATE.format(slug=slug)


def _user_url(username: str) -> str:
    return settings.MINDSET_USER_URL_TEMPLATE.format(username=username)


def _linkify_mentions(html: str) -> str:
    if not html or '@' not in html:
        return html

    def link_replace(m: re.Match[str]) -> str:
        user = m.group(1)
        return (
            f'<a class="mindset-mention" href="{escape(_user_url(user))}" '
            f'data-username="{escape(user)}">@{escape(user)}</a>'
        )

    parts: list[str] = []
    last = 0
    for anchor in _ANCHOR_BLOCK_RE.finditer(html):
        if anchor.start() > last:
            parts.append(_MENTION_RE.sub(link_replace, html[last:anchor.start()]))
        parts.append(anchor.group(0))
        last = anchor.end()
    if last < len(html):
        parts.append(_MENTION_RE.sub(link_replace, html[last:]))
    return ''.join(parts)


def _linkify_hashtags(html: str) -> str:
    if not html or '#' not in html:
        return html

    def link_replace(m: re.Match[str]) -> str:
        word = m.group(1)
        slug = slugify(word) or word.lower()
        return (
            f'<a class="mindset-hashtag" href="{escape(_tag_url(slug))}">'
            f'#{escape(word)}</a>'
        )

    parts: list[str] = []
    last = 0
    for anchor in _ANCHOR_BLOCK_RE.finditer(html):
        if anchor.start() > last:
            parts.append(_HASHTAG_RE.sub(link_replace, html[last:anchor.start()]))
        parts.append(anchor.group(0))
        last = anchor.end()
    if last < len(html):
        parts.append(_HASHTAG_RE.sub(link_replace, html[last:]))
    return ''.join(parts)


_YT_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')

_ANCHOR_WITH_HREF_RE = re.compile(
    r'<a\b[^>]*?\shref\s*=\s*(["\'])(?P<url>[^"\']+)\1[^>]*>(?P<text>.*?)</a>',
    re.I | re.DOTALL,
)


def _extract_youtube_id(url: str) -> str | None:
    """11-символьный id видео или None для не-YouTube URL."""
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    if host.startswith('m.'):
        host = host[2:]

    vid: str | None = None
    if host == 'youtu.be':
        vid = parsed.path.lstrip('/').split('/', 1)[0]
    elif host == 'youtube.com' or host.endswith('.youtube.com'):
        path = parsed.path
        if path == '/watch':
            vals = parse_qs(parsed.query).get('v') or []
            vid = vals[0] if vals else None
        elif path.startswith(('/embed/', '/shorts/', '/v/', '/live/')):
            parts = path.split('/', 3)
            vid = parts[2] if len(parts) >= 3 else None
    if vid and _YT_ID_RE.match(vid):
        return vid
    return None


def _embed_youtube_anchors(html: str) -> str:
    """YouTube-ссылки → ссылка на видео + iframe-плеер."""
    if not html or 'youtu' not in html.lower():
        return html

    def replace(m: re.Match[str]) -> str:
        href = html_module.unescape(m.group('url'))
        vid = _extract_youtube_id(href)
        if not vid:
            return m.group(0)
        safe_vid = escape(vid)
        watch_url = f'https://www.youtube.com/watch?v={safe_vid}'
        embed_url = f'https://www.youtube.com/embed/{safe_vid}'
        return (
            f'<div class="mindset-embed mindset-embed--youtube">'
            f'<a class="mindset-embed__link" href="{watch_url}" target="_blank" '
            f'rel="noopener noreferrer">{watch_url}</a>'
            f'<div class="mindset-embed__frame">'
            f'<iframe src="{embed_url}" title="YouTube video" loading="lazy" '
            f'referrerpolicy="strict-origin-when-cross-origin" '
            f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
            f'gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
            f'</div></div>'
        )

    return _ANCHOR_WITH_HREF_RE.sub(replace, html)


def render_body(raw: str) -> str:
    """Санитизация + linkify URL + хэштеги + YouTube. Безопасный HTML."""
    raw = raw or ''
    if _looks_like_html(raw):
        html = raw
    else:
        html = plain_text_to_html(raw)
    html = sanitize_and_linkify_html(html)
    html = _linkify_hashtags(html)
    html = _linkify_mentions(html)
    html = _embed_youtube_anchors(html)
    return html


def extract_hashtags(raw_text_or_html: str) -> list[str]:
    """Уникальные lowercase-имена хэштегов (без '#') в стабильном порядке."""
    if not raw_text_or_html:
        return []
    plain = re.sub(r'<[^>]+>', ' ', raw_text_or_html)
    seen: set[str] = set()
    out: list[str] = []
    for m in _HASHTAG_RE.finditer(plain):
        word = m.group(1).lower()
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out


def normalise_hashtags(names: Iterable[str]) -> list[tuple[str, str]]:
    """Для каждого имени тега вернуть (canonical_name, slug). Без дублей."""
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for raw in names:
        name = (raw or '').strip().lstrip('#').lower()
        if not name:
            continue
        slug = slugify(name) or name
        if slug in seen:
            continue
        seen.add(slug)
        out.append((name, slug))
    return out
