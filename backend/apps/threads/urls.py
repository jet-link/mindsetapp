from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    FeedView,
    ReplyDetailView,
    ReplyLikeView,
    ReplyRepostView,
    TagThemesView,
    ThemeViewSet,
    UserMediaView,
    UserRepliesView,
    UserRepostsView,
    UserThemesView,
)

router = DefaultRouter()
router.register('themes', ThemeViewSet, basename='theme')

urlpatterns = [
    path('feed/', FeedView.as_view(), name='feed'),
    path('replies/<int:pk>/', ReplyDetailView.as_view(), name='reply-detail'),
    path('replies/<int:pk>/like/', ReplyLikeView.as_view(), name='reply-like'),
    path('replies/<int:pk>/repost/', ReplyRepostView.as_view(), name='reply-repost'),
    path('tags/<slug:slug>/themes/', TagThemesView.as_view(), name='tag-themes'),
    path('users/<str:username>/themes/', UserThemesView.as_view(), name='user-themes'),
    path('users/<str:username>/reposts/', UserRepostsView.as_view(), name='user-reposts'),
    path('users/<str:username>/replies/', UserRepliesView.as_view(), name='user-replies'),
    path('users/<str:username>/media/', UserMediaView.as_view(), name='user-media'),
]
urlpatterns += router.urls
