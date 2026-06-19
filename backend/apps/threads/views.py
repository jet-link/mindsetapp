"""API v1 для тем/ответов/ленты. View только парсят запрос и зовут services."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet
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
from .image_service import MindsetImageError
from .models import (
    Reply,
    ReplyLike,
    ReplyRepost,
    Theme,
    ThemeLike,
    ThemeRepost,
    ThemeShare,
)
from .serializers import (
    ProfileReplySerializer,
    ReplyCreateSerializer,
    ReplySerializer,
    ThemeCreateSerializer,
    ThemeSerializer,
)

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
        .prefetch_related('images', 'hashtags')
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
            if q.startswith('#'):
                tag = q.lstrip('#').strip()
                if tag:
                    slug = slugify(tag)
                    return qs.filter(
                        Q(hashtags__slug=slug)
                        | Q(hashtags__name__iexact=tag)
                        | Q(hashtags__slug__icontains=slug)
                    ).distinct()
                return Theme.objects.none()
            return qs.filter(body_text__icontains=q)

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
        images = request.FILES.getlist('images')
        try:
            theme = services.create_theme(
                author=request.user, body=ser.validated_data['body'], images=images
            )
        except MindsetImageError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        theme = _theme_queryset().get(pk=theme.pk)
        out = ThemeSerializer(theme, context=_viewer_context(request, [theme]))
        return Response(out.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        """Тред: тема + первый уровень ответов (children грузим отдельно)."""
        theme = self.get_object()
        replies = list(
            theme.replies.filter(is_deleted=False, parent__isnull=True)
            .select_related('author')
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
        wait = cooldown_retry_after(request.user, **REPLY_COOLDOWN)
        if wait:
            return _cooldown_response(wait, 'replying')
        theme = self.get_object()
        ser = ReplyCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        parent = None
        parent_id = ser.validated_data.get('parent_id')
        if parent_id:
            parent = get_object_or_404(Reply, pk=parent_id, theme=theme, is_deleted=False)
        try:
            reply = services.create_reply(
                theme=theme,
                author=request.user,
                body=ser.validated_data['body'],
                parent=parent,
                images=request.FILES.getlist('images'),
            )
        except MindsetImageError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        out = ReplySerializer(reply, context=_reply_viewer_context(request, [reply]))
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
            Reply.objects.select_related('author', 'theme'),
            pk=pk,
            is_deleted=False,
        )
        children = list(
            reply.children.filter(is_deleted=False)
            .select_related('author')
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


class UserRepostsView(generics.ListAPIView):
    """GET /users/{username}/reposts/ — темы, которые пользователь репостнул."""

    serializer_class = ThemeSerializer

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'])
        return _theme_queryset().filter(reposts__user=user)

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}


def _profile_reply_context(request, replies: list[Reply]) -> dict:
    ctx = {**_reply_viewer_context(request, replies)}
    themes = [r.theme for r in replies]
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
            .select_related('author', 'theme', 'theme__author')
            .prefetch_related('theme__images', 'theme__hashtags')
            .order_by('-created_at')
        )

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        replies = list(page) if page is not None else []
        return {
            **super().get_serializer_context(),
            **_profile_reply_context(self.request, replies),
        }


class UserMediaView(generics.ListAPIView):
    """GET /users/{username}/media/ — темы пользователя с картинками."""

    serializer_class = ThemeSerializer

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'])
        return _theme_queryset().filter(author=user, images__isnull=False).distinct()

    def get_serializer_context(self):
        page = getattr(self.paginator, 'page', None)
        themes = list(page) if page is not None else []
        return {**super().get_serializer_context(), **_viewer_context(self.request, themes)}
