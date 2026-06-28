"""API v1 для тем/ответов/ленты. View только парсят запрос и зовут services."""
from __future__ import annotations

import logging
import traceback

from django.conf import settings as dj_settings
from django.contrib.auth import get_user_model
from django.db.models import Max, Q, QuerySet
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import FeedCursorPagination
from apps.core.throttling import (
    REPLY_COOLDOWN,
    THEME_COOLDOWN,
    cooldown_retry_after,
)
from apps.follows.models import Follow

from . import services
from .media_service import MindsetMediaError
from .models import (
    Reply,
    ReplyLike,
    ReplyMedia,
    ReplyRepost,
    Theme,
    ThemeLike,
    ThemeMedia,
    ThemeRepost,
    ThemeShare,
)
from .serializers import (
    MediaSerializer,
    ProfileRepostSerializer,
    ProfileReplySerializer,
    ReplyCreateSerializer,
    ReplySerializer,
    ThemeCreateSerializer,
    ThemeSerializer,
)

logger = logging.getLogger(__name__)


def _unexpected_error_response(where: str, **ctx):
    """Логирует полный traceback и отдаёт его в detail при DEBUG, иначе общее
    сообщение. Чтобы вместо немой HTML-500 пользователь/консоль видели причину."""
    logger.exception('Unexpected error in %s (%s)', where, ctx)
    if dj_settings.DEBUG:
        detail = f'{where}: {traceback.format_exc()}'
    else:
        detail = 'Server error. Please try again.'
    return Response({'detail': detail}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

User = get_user_model()


def _cooldown_response(wait: int, verb: str) -> Response:
    """200-ответ о кулдауне (без 429 в консоли браузера). Фронт читает retry_after."""
    unit = 'second' if wait == 1 else 'seconds'
    return Response({
        'ok': False,
        'cooldown': True,
        'retry_after': wait,
        'detail': f"You're {verb} too fast. Try again in {wait} {unit}.",
    })


def _viewer_context(request, themes: list[Theme]) -> dict:
    """liked_ids / reposted_ids одним запросом на страницу (без N+1)."""
    ctx = {'request': request}
    if not request.user.is_authenticated or not themes:
        return ctx
    ids = [t.pk for t in themes]
    ctx['liked_ids'] = set(
        ThemeLike.objects.filter(user=request.user, theme_id__in=ids)
        .values_list('theme_id', flat=True)
    )
    ctx['reposted_ids'] = set(
        ThemeRepost.objects.filter(user=request.user, theme_id__in=ids)
        .values_list('theme_id', flat=True)
    )
    ctx['shared_ids'] = set(
        ThemeShare.objects.filter(user=request.user, theme_id__in=ids)
        .values_list('theme_id', flat=True)
    )
    return ctx


def _reply_viewer_context(request, replies: list[Reply]) -> dict:
    ctx = {'request': request}
    if not request.user.is_authenticated or not replies:
        return ctx
    ids = [r.pk for r in replies]
    ctx['liked_ids'] = set(
        ReplyLike.objects.filter(user=request.user, reply_id__in=ids)
        .values_list('reply_id', flat=True)
    )
    ctx['reposted_ids'] = set(
        ReplyRepost.objects.filter(user=request.user, reply_id__in=ids)
        .values_list('reply_id', flat=True)
    )
    return ctx


def _theme_queryset() -> QuerySet[Theme]:
    return (
        Theme.objects.filter(is_deleted=False)
        .select_related('author')
        .prefetch_related('media', 'hashtags')
    )


class FeedView(generics.ListAPIView):
    """GET /feed/?tab=main|my|for-you|following&cursor=...

    main      — все свежие темы (общая стена);
    my        — только темы текущего пользователя (требует auth);
    for-you   — пока те же свежие темы, ранжирование добавим позже;
    following — темы авторов, на которых подписан текущий пользователь.
    """

    serializer_class = ThemeSerializer
    pagination_class = FeedCursorPagination

    def get_queryset(self):
        qs = _theme_queryset()
        tab = self.request.query_params.get('tab', 'main')
        q = self.request.query_params.get('q', '').strip()
        user = self.request.user

        # Поиск: #tag → по хэштегу, обычный текст → по body_text.
        if q:
            from apps.users.search_services import search_themes_queryset

            return search_themes_queryset(q)

        if tab == 'my':
            if not user.is_authenticated:
                return Theme.objects.none()
            return qs.filter(author=user)

        if tab == 'liked':
            if not user.is_authenticated:
                return Theme.objects.none()
            return qs.filter(likes__user=user).distinct()

        if tab == 'following':
            if not user.is_authenticated:
                return Theme.objects.none()
            followee_ids = Follow.objects.filter(follower=user).values_list(
                'followee_id', flat=True
            )
            return qs.filter(author_id__in=followee_ids)

        # main / for-you
        return qs

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}


class ThemeViewSet(viewsets.GenericViewSet):
    """CRUD + действия для тем."""

    queryset = Theme.objects.none()  # для router; реальный queryset ниже
    serializer_class = ThemeSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_object(self) -> Theme:
        return get_object_or_404(_theme_queryset(), pk=self.kwargs['pk'])

    def create(self, request):
        wait = cooldown_retry_after(request.user, **THEME_COOLDOWN)
        if wait:
            return _cooldown_response(wait, 'posting')
        ser = ThemeCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        media = request.FILES.getlist('media')
        if not ser.validated_data['body'].strip() and not media:
            return Response(
                {'detail': 'Add some text or media.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            theme = services.create_theme(
                author=request.user, body=ser.validated_data['body'], media=media
            )
            theme = _theme_queryset().get(pk=theme.pk)
            out = ThemeSerializer(theme, context=_viewer_context(request, [theme]))
            return Response(out.data, status=status.HTTP_201_CREATED)
        except MindsetMediaError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response('theme_create', media_count=len(media))

    def retrieve(self, request, pk=None):
        """Тред: тема + первый уровень ответов (children грузим отдельно)."""
        theme = self.get_object()
        replies = list(
            theme.replies.filter(is_deleted=False, parent__isnull=True)
            .select_related('author')
            .prefetch_related('media')
            .order_by('-created_at')
        )
        theme_data = ThemeSerializer(theme, context=_viewer_context(request, [theme])).data
        replies_data = ReplySerializer(
            replies, many=True, context=_reply_viewer_context(request, replies)
        ).data
        return Response({'theme': theme_data, 'replies': replies_data})

    def partial_update(self, request, pk=None):
        theme = self.get_object()
        if theme.author_id != request.user.pk:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not theme.is_editable:
            return Response(
                {'detail': 'Theme is no longer editable.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = ThemeCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        theme = services.update_theme(theme=theme, body=ser.validated_data['body'])
        theme = _theme_queryset().get(pk=theme.pk)
        out = ThemeSerializer(theme, context=_viewer_context(request, [theme]))
        return Response(out.data)

    def destroy(self, request, pk=None):
        theme = self.get_object()
        if theme.author_id != request.user.pk:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not theme.is_deletable:
            return Response(
                {'detail': 'Theme is no longer deletable.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        services.soft_delete_theme(theme=theme)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, pk=None):
        theme = self.get_object()
        liked = services.toggle_theme_like(theme=theme, user=request.user)
        theme.refresh_from_db(fields=['likes_count'])
        return Response({'liked': liked, 'likes_count': theme.likes_count})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def repost(self, request, pk=None):
        theme = self.get_object()
        reposted = services.toggle_theme_repost(theme=theme, user=request.user)
        theme.refresh_from_db(fields=['reposts_count'])
        return Response({'reposted': reposted, 'reposts_count': theme.reposts_count})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def share(self, request, pk=None):
        theme = self.get_object()
        services.share_theme(theme=theme, user=request.user)
        theme.refresh_from_db(fields=['shares_count'])
        # shared всегда True: повторный шэр не увеличивает счетчик (анти-накрутка)
        return Response({'shared': True, 'shares_count': theme.shares_count})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def replies(self, request, pk=None):
        theme = self.get_object()
        ser = ReplyCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        reply_media = request.FILES.getlist('media')
        if not ser.validated_data['body'].strip() and not reply_media:
            return Response(
                {'detail': 'Add some text or media.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        parent = None
        parent_id = ser.validated_data.get('parent_id')
        if parent_id:
            parent = get_object_or_404(Reply, pk=parent_id, theme=theme, is_deleted=False)
        # Кулдаун точечный: по конкретному адресату (ответ ответу / ответ теме),
        # чтобы ответ одной теме/ответу не блокировал формы других.
        cooldown_target = f'reply:{parent.pk}' if parent else f'theme:{theme.pk}'
        wait = cooldown_retry_after(
            request.user, **REPLY_COOLDOWN, target=cooldown_target
        )
        if wait:
            return _cooldown_response(wait, 'replying')
        try:
            reply = services.create_reply(
                theme=theme,
                author=request.user,
                body=ser.validated_data['body'],
                parent=parent,
                media=reply_media,
            )
            out = ReplySerializer(reply, context=_reply_viewer_context(request, [reply]))
        except MindsetMediaError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response('reply_create', media_count=len(reply_media))
        theme.refresh_from_db(fields=['replies_count'])
        payload = dict(out.data)
        payload['theme_replies_count'] = theme.replies_count
        if parent is not None:
            parent.refresh_from_db(fields=['replies_count'])
            payload['parent_replies_count'] = parent.replies_count
        return Response(payload, status=status.HTTP_201_CREATED)


class ReplyLikeView(generics.GenericAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ReplySerializer

    def post(self, request, pk):
        reply = get_object_or_404(Reply, pk=pk, is_deleted=False)
        liked = services.toggle_reply_like(reply=reply, user=request.user)
        reply.refresh_from_db(fields=['likes_count'])
        return Response({'liked': liked, 'likes_count': reply.likes_count})


class ReplyRepostView(generics.GenericAPIView):
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = ReplySerializer

    def post(self, request, pk):
        reply = get_object_or_404(Reply, pk=pk, is_deleted=False)
        reposted = services.toggle_reply_repost(reply=reply, user=request.user)
        reply.refresh_from_db(fields=['reposts_count'])
        return Response({'reposted': reposted, 'reposts_count': reply.reposts_count})


class ReplyDetailView(APIView):
    """GET /replies/{pk}/ — ответ + его дочерние ответы (replies of reply).
    DELETE /replies/{pk}/ — мягкое удаление автором (окно 24 ч)."""

    def get(self, request, pk):
        reply = get_object_or_404(
            Reply.objects.select_related('author', 'theme').prefetch_related('media'),
            pk=pk,
            is_deleted=False,
        )
        children = list(
            reply.children.filter(is_deleted=False)
            .select_related('author')
            .prefetch_related('media')
            .order_by('-created_at')
        )
        reply_data = ReplySerializer(
            reply, context=_reply_viewer_context(request, [reply])
        ).data
        children_data = ReplySerializer(
            children, many=True, context=_reply_viewer_context(request, children)
        ).data
        return Response({'reply': reply_data, 'replies': children_data})

    def delete(self, request, pk):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        reply = get_object_or_404(Reply, pk=pk, is_deleted=False)
        if reply.author_id != request.user.pk:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not reply.is_deletable:
            return Response(
                {'detail': 'Reply is no longer deletable.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = services.soft_delete_reply(reply=reply)
        return Response(payload, status=status.HTTP_200_OK)


class TagThemesView(generics.ListAPIView):
    """GET /tags/{slug}/themes/"""

    serializer_class = ThemeSerializer

    def get_queryset(self):
        return _theme_queryset().filter(hashtags__slug=self.kwargs['slug'])

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}


class UserThemesView(generics.ListAPIView):
    """GET /users/{username}/themes/"""

    serializer_class = ThemeSerializer

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'])
        return _theme_queryset().filter(author=user)

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}


class UserRepostsView(APIView):
    """GET /users/{username}/reposts/ — темы и ответы, которые пользователь репостнул.

    Сортировка по времени репоста (reposted_at), а не по дате поста.
    Offset-курсор, т.к. поток объединён из двух таблиц."""

    PAGE_SIZE = 20

    def _offset(self, request) -> int:
        try:
            return max(0, int(request.query_params.get('cursor')))
        except (TypeError, ValueError):
            return 0

    def get(self, request, username):
        user = get_object_or_404(User, username=username)

        theme_rows = list(
            ThemeRepost.objects.filter(user=user, theme__is_deleted=False)
            .values_list('pk', 'theme_id', 'created_at')
        )
        reply_rows = list(
            ReplyRepost.objects.filter(
                user=user,
                reply__is_deleted=False,
                reply__theme__is_deleted=False,
            ).values_list('pk', 'reply_id', 'created_at')
        )

        combined = [
            ('theme', theme_id, ts, pk) for pk, theme_id, ts in theme_rows
        ]
        combined += [
            ('reply', reply_id, ts, pk) for pk, reply_id, ts in reply_rows
        ]
        combined.sort(key=lambda x: (x[2], x[3]), reverse=True)

        offset = self._offset(request)
        page_rows = combined[offset:offset + self.PAGE_SIZE]

        theme_ids = [obj_id for kind, obj_id, _, _ in page_rows if kind == 'theme']
        reply_ids = [obj_id for kind, obj_id, _, _ in page_rows if kind == 'reply']

        themes_map = {
            t.pk: t for t in _theme_queryset().filter(pk__in=theme_ids)
        }
        replies_map = {
            r.pk: r
            for r in Reply.objects.filter(
                pk__in=reply_ids,
                is_deleted=False,
                theme__is_deleted=False,
            )
            .select_related('author', 'theme', 'theme__author')
            .prefetch_related('media')
        }

        theme_ctx = _viewer_context(request, list(themes_map.values()))
        reply_ctx = _reply_viewer_context(request, list(replies_map.values()))

        results = []
        for kind, obj_id, reposted_at, _pk in page_rows:
            if kind == 'theme':
                theme = themes_map.get(obj_id)
                if theme is None:
                    continue
                ctx = {**theme_ctx, 'request': request}
                item = {
                    'kind': 'theme',
                    'reposted_at': reposted_at,
                    'theme': theme,
                    'reply': None,
                }
            else:
                reply = replies_map.get(obj_id)
                if reply is None:
                    continue
                ctx = {**reply_ctx, 'request': request}
                item = {
                    'kind': 'reply',
                    'reposted_at': reposted_at,
                    'theme': None,
                    'reply': reply,
                }
            results.append(ProfileRepostSerializer(item, context=ctx).data)

        next_url = None
        if offset + self.PAGE_SIZE < len(combined):
            next_offset = offset + self.PAGE_SIZE
            next_url = request.build_absolute_uri(
                f'{request.path}?cursor={next_offset}'
            )
        return Response({'next': next_url, 'previous': None, 'results': results})


def _profile_reply_context(request, replies: list[Reply]) -> dict:
    ctx = {**_reply_viewer_context(request, replies)}
    themes = [r.theme for r in replies]
    parent_ids = [r.parent_id for r in replies if r.parent_id]
    if request.user.is_authenticated and parent_ids:
        ctx['parent_liked_ids'] = set(
            ReplyLike.objects.filter(user=request.user, reply_id__in=parent_ids)
            .values_list('reply_id', flat=True)
        )
        ctx['parent_reposted_ids'] = set(
            ReplyRepost.objects.filter(user=request.user, reply_id__in=parent_ids)
            .values_list('reply_id', flat=True)
        )
    else:
        ctx['parent_liked_ids'] = set()
        ctx['parent_reposted_ids'] = set()
    if not request.user.is_authenticated or not themes:
        ctx['theme_liked_ids'] = set()
        ctx['theme_reposted_ids'] = set()
        ctx['theme_shared_ids'] = set()
        return ctx
    theme_ids = [t.pk for t in themes]
    ctx['theme_liked_ids'] = set(
        ThemeLike.objects.filter(user=request.user, theme_id__in=theme_ids)
        .values_list('theme_id', flat=True)
    )
    ctx['theme_reposted_ids'] = set(
        ThemeRepost.objects.filter(user=request.user, theme_id__in=theme_ids)
        .values_list('theme_id', flat=True)
    )
    ctx['theme_shared_ids'] = set(
        ThemeShare.objects.filter(user=request.user, theme_id__in=theme_ids)
        .values_list('theme_id', flat=True)
    )
    return ctx


class UserRepliesView(generics.ListAPIView):
    """GET /users/{username}/replies/ — ответы пользователя."""

    serializer_class = ProfileReplySerializer

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'])
        return (
            Reply.objects
            .filter(author=user, is_deleted=False, theme__is_deleted=False)
            .select_related('author', 'theme', 'theme__author', 'parent', 'parent__author')
            .prefetch_related('media', 'theme__media', 'theme__hashtags', 'parent__media')
            .order_by('-created_at')
        )

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        replies = list(page) if page is not None else []
        return {
            **super().get_serializer_context(),
            **_profile_reply_context(self.request, replies),
        }


class UserMediaView(APIView):
    """GET /users/{username}/media/ — все изображения пользователя из тем И
    ответов, единой сеткой. Самые свежие сверху, дубликаты (один и тот же файл)
    не повторяются. Offset-курсор, т.к. поток объединён из двух таблиц."""

    PAGE_SIZE = 30

    def _offset(self, request) -> int:
        try:
            return max(0, int(request.query_params.get('cursor')))
        except (TypeError, ValueError):
            return 0

    def get(self, request, username):
        user = get_object_or_404(User, username=username)

        # Лёгкая выборка только (pk, uploaded_at) из обеих таблиц.
        theme_rows = ThemeMedia.objects.filter(
            theme__author=user, theme__is_deleted=False,
        ).values_list('pk', 'uploaded_at')
        reply_rows = ReplyMedia.objects.filter(
            reply__author=user,
            reply__is_deleted=False,
            reply__theme__is_deleted=False,
        ).values_list('pk', 'uploaded_at')

        combined = [('t', pk, ts) for pk, ts in theme_rows]
        combined += [('r', pk, ts) for pk, ts in reply_rows]
        # Самые свежие сверху; pk — стабильный тай-брейк.
        combined.sort(key=lambda x: (x[2], x[1]), reverse=True)

        offset = self._offset(request)
        page_rows = combined[offset:offset + self.PAGE_SIZE]

        t_ids = [pk for src, pk, _ in page_rows if src == 't']
        r_ids = [pk for src, pk, _ in page_rows if src == 'r']
        t_map = {m.pk: m for m in ThemeMedia.objects.filter(pk__in=t_ids)}
        r_map = {m.pk: m for m in ReplyMedia.objects.filter(pk__in=r_ids)}

        results = []
        seen_urls: set[str] = set()
        for src, pk, _ts in page_rows:
            obj = (t_map if src == 't' else r_map).get(pk)
            if obj is None:
                continue
            data = MediaSerializer(obj, context={'request': request}).data
            # Дедуп по реальному файлу: один и тот же url в сетке не повторяем.
            url = data.get('url') or ''
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            data['key'] = f'{src}{pk}'
            if src == 't':
                data['source_type'] = 'theme'
                data['theme_id'] = obj.theme_id
                data['reply_id'] = None
            else:
                data['source_type'] = 'reply'
                data['theme_id'] = obj.reply.theme_id
                data['reply_id'] = obj.reply_id
            results.append(data)

        next_url = None
        if offset + self.PAGE_SIZE < len(combined):
            next_offset = offset + self.PAGE_SIZE
            next_url = request.build_absolute_uri(
                f'{request.path}?cursor={next_offset}'
            )
        return Response({'next': next_url, 'previous': None, 'results': results})
