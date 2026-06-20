from django.db.models import Exists, OuterRef, Q

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.threads.models import ThemeRepost

from .models import Notification
from .serializers import NotificationSerializer
from .services import purge_stale_notifications

# На экране уведомлений показываем только ответы и репосты тем.
NOTIFICATION_VERBS = ('reply', 'repost')


def _visible_notifications(user):
    purge_stale_notifications(recipient=user)
    repost_exists = ThemeRepost.objects.filter(
        theme_id=OuterRef('theme_id'),
        user_id=OuterRef('actor_id'),
    )
    return (
        Notification.objects.filter(recipient=user, verb__in=NOTIFICATION_VERBS)
        .select_related('actor', 'reply', 'theme')
        .filter(
            Q(verb='reply', reply__isnull=False, reply__is_deleted=False)
            | (Q(verb='repost', theme__isnull=False) & Q(Exists(repost_exists))),
        )
    )


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return _visible_notifications(self.request.user)


class NotificationUnreadCountView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        count = _visible_notifications(request.user).filter(is_read=False).count()
        return Response({'unread_count': count})


class NotificationMarkReadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        updated = (
            _visible_notifications(request.user)
            .filter(is_read=False)
            .update(is_read=True)
        )
        return Response({'marked_read': updated}, status=status.HTTP_200_OK)


class NotificationClearView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        deleted, _ = _visible_notifications(request.user).delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)
