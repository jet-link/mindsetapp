from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import IdCursorPagination
from apps.follows.models import Follow
from apps.follows.services import FollowError, toggle_follow

from .serializers import (
    MeSerializer,
    UserCardSerializer,
    UserProfileSerializer,
)

User = get_user_model()


def _following_ids_context(view) -> dict:
    """Множество id из текущей страницы, на которые подписан request.user."""
    ctx = {'request': view.request}
    user = view.request.user
    page = getattr(view.paginator, 'page', None)
    users = list(page) if page is not None else []
    if user.is_authenticated and users:
        ids = [u.pk for u in users]
        ctx['following_ids'] = set(
            Follow.objects.filter(follower=user, followee_id__in=ids)
            .values_list('followee_id', flat=True)
        )
    return ctx


class UserProfileView(generics.RetrieveAPIView):
    """GET /users/{username}/"""

    serializer_class = UserProfileSerializer
    lookup_field = 'username'
    queryset = User.objects.filter(is_active=True)


class FollowToggleView(APIView):
    """POST /users/{username}/follow/ — toggle."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, username):
        followee = get_object_or_404(User, username=username, is_active=True)
        try:
            following = toggle_follow(follower=request.user, followee=followee)
        except FollowError as e:
            return Response({'detail': str(e)}, status=400)
        followee.refresh_from_db(fields=['followers_count'])
        request.user.refresh_from_db(fields=['following_count'])
        return Response({
            'following': following,
            'followers_count': followee.followers_count,
            'following_count': request.user.following_count,
        })


class FollowersListView(generics.ListAPIView):
    """GET /users/{username}/followers/ — кто подписан на пользователя."""

    serializer_class = UserCardSerializer
    pagination_class = IdCursorPagination

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'], is_active=True)
        q = self.request.query_params.get('q', '').strip()
        # X подписан на user: Follow(follower=X, followee=user) → X.following__followee=user
        qs = User.objects.filter(
            following__followee=user, is_active=True
        ).distinct()
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(bio__icontains=q))
        return qs

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_following_ids_context(self)}


class FollowingListView(generics.ListAPIView):
    """GET /users/{username}/following/ — на кого подписан пользователь."""

    serializer_class = UserCardSerializer
    pagination_class = IdCursorPagination

    def get_queryset(self):
        user = get_object_or_404(User, username=self.kwargs['username'], is_active=True)
        q = self.request.query_params.get('q', '').strip()
        # user подписан на Y: Follow(follower=user, followee=Y) → Y.followers__follower=user
        qs = User.objects.filter(
            followers__follower=user, is_active=True
        ).distinct()
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(bio__icontains=q))
        return qs

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_following_ids_context(self)}


class UserSearchView(generics.ListAPIView):
    """Legacy alias — используй RankedUserSearchView в urls."""

    serializer_class = UserCardSerializer
    pagination_class = IdCursorPagination

    def get_queryset(self):
        from .search_services import search_users_queryset

        q = self.request.query_params.get('q', '').strip()
        username_only = self.request.query_params.get('username_only', '').lower() in (
            '1', 'true', 'yes',
        )
        return search_users_queryset(q, username_only=username_only)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **_following_ids_context(self)}


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /me/ — свой профиль (avatar, bio)."""

    serializer_class = MeSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user
