from django.urls import path

from .views import (
    NotificationClearView,
    NotificationListView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
)

urlpatterns = [
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/unread/', NotificationUnreadCountView.as_view(), name='notification-unread'),
    path('notifications/read/', NotificationMarkReadView.as_view(), name='notification-read'),
    path('notifications/clear/', NotificationClearView.as_view(), name='notification-clear'),
]
