"""Поиск, discover и аналитика запросов."""
from __future__ import annotations

import re
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.utils import timezone

from apps.threads.models import Hashtag, Theme

User = get_user_model()

DISCOVER_POPULAR_CACHE_KEY = 'search:discover:popular:v1'
DISCOVER_TRENDING_CACHE_KEY = 'search:discover:trending:v1'

SEARCH_STOPWORDS = frozenset({'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'to'})


def _discover_cache_ttl(mode: str) -> int:
    if mode == 'trending':
        return getattr(settings, 'SEARCH_TRENDING_CACHE_TTL', 600)
    return getattr(settings, 'SEARCH_DISCOVER_CACHE_TTL', 900)


def _min_hashtag_themes() -> int:
    return getattr(settings, 'SEARCH_MIN_HASHTAG_THEMES', 2)


def _trending_days() -> int:
    return getattr(settings, 'SEARCH_TRENDING_DAYS', 7)


def normalize_search_query(tab: str, query: str) -> str:
    """Нормализация для логов поисковых событий."""
    q = (query or '').strip().lower()
    q = re.sub(r'\s+', ' ', q)
    if tab == 'themes' and q.startswith('#'):
        q = q.lstrip('#').strip()
    if tab == 'users' and q.startswith('@'):
        q = q.lstrip('@').strip()
    if len(q) > 128:
        q = q[:128]
    return q


def _is_valid_logged_query(tab: str, query: str) -> bool:
    q = normalize_search_query(tab, query)
    if len(q) < 2:
        return False
    if q in SEARCH_STOPWORDS:
        return False
    return True


def _discover_user_qs():
    return User.objects.filter(is_active=True, is_staff=False).filter(
        Q(themes_count__gt=0) | Q(followers_count__gt=0)
    )


def get_popular_hashtags(limit: int = 6) -> list[str]:
    return list(
        Hashtag.objects.filter(themes_count__gte=_min_hashtag_themes())
        .order_by('-themes_count', 'name')
        .values_list('name', flat=True)[:limit]
    )


def get_popular_accounts(limit: int = 6) -> list[str]:
    return list(
        _discover_user_qs()
        .order_by('-followers_count', 'username')
        .values_list('username', flat=True)[:limit]
    )


def get_trending_hashtags(limit: int = 6) -> list[str]:
    since = timezone.now() - timedelta(days=_trending_days())
    rows = (
        Hashtag.objects.filter(
            themes__created_at__gte=since,
            themes__is_deleted=False,
        )
        .annotate(recent_count=Count('themes', distinct=True))
        .filter(recent_count__gte=1)
        .order_by('-recent_count', '-themes_count', 'name')
        .values_list('name', flat=True)[:limit]
    )
    names = list(rows)
    if names:
        return names
    return get_popular_hashtags(limit)


def get_trending_accounts(limit: int = 6) -> list[str]:
    since = timezone.now() - timedelta(days=_trending_days())
    rows = (
        _discover_user_qs()
        .filter(themes__created_at__gte=since, themes__is_deleted=False)
        .annotate(recent_themes=Count('themes', distinct=True))
        .filter(recent_themes__gte=1)
        .order_by('-recent_themes', '-followers_count', 'username')
        .values_list('username', flat=True)[:limit]
    )
    names = list(rows)
    if names:
        return names
    return get_popular_accounts(limit)


def get_discover(mode: str = 'popular') -> dict:
    """Discover block: popular or trending hashtags + accounts."""
    cache_key = (
        DISCOVER_TRENDING_CACHE_KEY if mode == 'trending' else DISCOVER_POPULAR_CACHE_KEY
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    if mode == 'trending':
        payload = {
            'mode': 'trending',
            'themes': get_trending_hashtags(),
            'users': get_trending_accounts(),
        }
    else:
        payload = {
            'mode': 'popular',
            'themes': get_popular_hashtags(),
            'users': get_popular_accounts(),
        }

    payload['cached_until'] = (
        timezone.now() + timedelta(seconds=_discover_cache_ttl(mode))
    ).isoformat()
    cache.set(cache_key, payload, timeout=_discover_cache_ttl(mode))
    return payload


def record_search_event(request, tab: str, query: str) -> None:
    """Логируем успешный поиск (с rate-limit dedup)."""
    from .models import SearchEvent

    if not _is_valid_logged_query(tab, query):
        return

    normalized = normalize_search_query(tab, query)
    user = request.user if request.user.is_authenticated else None
    ident = f'user:{user.pk}' if user else f'ip:{_client_ip(request)}'
    dedup_key = f'search:event:dedup:{ident}:{tab}:{normalized}'
    if cache.get(dedup_key):
        return
    cache.set(dedup_key, 1, timeout=60)

    SearchEvent.objects.create(
        tab=tab,
        query_normalized=normalized,
        user=user,
    )


def _client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


def search_themes_queryset(q: str):
    """Themes search с ранжированием по релевантности."""
    from django.utils.text import slugify

    qs = (
        Theme.objects.filter(is_deleted=False)
        .select_related('author')
        .prefetch_related('media', 'hashtags')
    )
    q = (q or '').strip()
    if not q:
        return Theme.objects.none()

    if q.startswith('#'):
        tag = q.lstrip('#').strip()
        if not tag:
            return Theme.objects.none()
        slug = slugify(tag)
        return (
            qs.filter(
                Q(hashtags__slug=slug)
                | Q(hashtags__name__iexact=tag)
                | Q(hashtags__slug__icontains=slug)
            )
            .annotate(
                relevance=Case(
                    When(hashtags__slug=slug, then=Value(3)),
                    When(hashtags__name__iexact=tag, then=Value(2)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .distinct()
            .order_by('-relevance', '-created_at')
        )

    return (
        qs.filter(body_text__icontains=q)
        .annotate(
            relevance=Case(
                When(body_text__istartswith=q, then=Value(3)),
                When(body_text__icontains=f' {q} ', then=Value(2)),
                When(body_text__icontains=q, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .order_by('-relevance', '-created_at')
    )


def search_users_queryset(q: str, *, username_only: bool = False):
    """Users search с ранжированием по релевантности."""
    q = (q or '').strip()
    if q.startswith('@'):
        q = q.lstrip('@').strip()
    if not q:
        return User.objects.none()

    qs = User.objects.filter(is_active=True)
    if username_only:
        return (
            qs.filter(username__icontains=q)
            .annotate(
                relevance=Case(
                    When(username__iexact=q, then=Value(3)),
                    When(username__istartswith=q, then=Value(2)),
                    When(username__icontains=q, then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField(),
                )
            )
            .order_by('-relevance', '-followers_count', 'username')
        )

    return (
        qs.filter(Q(username__icontains=q) | Q(bio__icontains=q))
        .annotate(
            relevance=Case(
                When(username__iexact=q, then=Value(4)),
                When(username__istartswith=q, then=Value(3)),
                When(username__icontains=q, then=Value(2)),
                When(bio__icontains=q, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .order_by('-relevance', '-followers_count', 'username')
    )
