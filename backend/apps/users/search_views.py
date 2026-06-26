"""Search API views."""
from __future__ import annotations

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import FeedCursorPagination, IdCursorPagination
from apps.threads.serializers import ThemeSerializer
from apps.threads.views import _viewer_context

from .search_services import (
    get_discover,
    get_guest_popular_queries,
    get_popular_queries,
    record_search_event,
    search_themes_queryset,
    search_users_queryset,
)
from .serializers import UserCardSerializer
from .views import _following_ids_context


class DiscoverSearchView(APIView):
    """GET /search/discover/?mode=popular|trending"""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        mode = request.query_params.get('mode', 'popular').lower()
        if mode not in ('popular', 'trending'):
            mode = 'popular'
        return Response(get_discover(mode))


class PopularQueriesView(APIView):
    """GET /search/popular/ — частые поисковые запросы из analytics."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        audience = request.query_params.get('audience', '').lower()
        if audience == 'guest':
            return Response(get_guest_popular_queries())
        payload = get_popular_queries()
        payload['guest'] = get_guest_popular_queries()
        return Response(payload)


class SearchEventCreateView(APIView):
    """POST /search/events/ — лог успешного поиска с клиента."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        tab = (request.data.get('tab') or '').strip().lower()
        query = (request.data.get('query') or '').strip()
        if tab not in ('themes', 'users'):
            return Response({'detail': 'Invalid tab.'}, status=status.HTTP_400_BAD_REQUEST)
        record_search_event(request, tab, query)
        return Response({'ok': True}, status=status.HTTP_201_CREATED)


class ThemeSearchView(generics.ListAPIView):
    """GET /search/themes/?q= — поиск тем с ранжированием."""

    serializer_class = ThemeSerializer
    pagination_class = FeedCursorPagination

    def get_queryset(self):
        q = self.request.query_params.get('q', '').strip()
        return search_themes_queryset(q)

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}

    def list(self, request, *args, **kwargs):
        q = request.query_params.get('q', '').strip()
        response = super().list(request, *args, **kwargs)
        if q:
            record_search_event(request, 'themes', q)
        return response


class RankedUserSearchView(generics.ListAPIView):
    """GET /users/search/?q= — поиск пользователей с ранжированием."""

    serializer_class = UserCardSerializer
    pagination_class = IdCursorPagination

    def get_queryset(self):
        q = self.request.query_params.get('q', '').strip()
        username_only = self.request.query_params.get('username_only', '').lower() in (
            '1', 'true', 'yes',
        )
        return search_users_queryset(q, username_only=username_only)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_following_ids_context(self)}

    def list(self, request, *args, **kwargs):
        q = request.query_params.get('q', '').strip()
        response = super().list(request, *args, **kwargs)
        if q:
            record_search_event(request, 'users', q)
        return response
