from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer

# На экране уведомлений показываем только ответы и репосты тем.
NOTIFICATION_VERBS = ('reply', 'repost')


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return (
            Notification.objects
            .filter(recipient=self.request.user, verb__in=NOTIFICATION_VERBS)
            .select_related('actor', 'reply')
        )


class NotificationUnreadCountView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        count = (
            Notification.objects
            .filter(recipient=request.user, is_read=False, verb__in=NOTIFICATION_VERBS)
            .count()
        )
        return Response({'unread_count': count})


class NotificationMarkReadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        updated = (
            Notification.objects
            .filter(
                recipient=request.user,
                is_read=False,
                verb__in=NOTIFICATION_VERBS,
            )
            .update(is_read=True)
        )
        return Response({'marked_read': updated}, status=status.HTTP_200_OK)


class NotificationClearView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        deleted, _ = (
            Notification.objects
            .filter(recipient=request.user, verb__in=NOTIFICATION_VERBS)
            .delete()
        )
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)
