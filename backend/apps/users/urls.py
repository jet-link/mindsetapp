from django.urls import path

from .views import (
    FollowersListView,
    FollowingListView,
    FollowToggleView,
    MeView,
    PopularSearchView,
    UserProfileView,
    UserSearchView,
)

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('search/popular/', PopularSearchView.as_view(), name='search-popular'),
    path('users/search/', UserSearchView.as_view(), name='user-search'),
    path('users/<str:username>/', UserProfileView.as_view(), name='user-profile'),
    path('users/<str:username>/follow/', FollowToggleView.as_view(), name='user-follow'),
    path('users/<str:username>/followers/', FollowersListView.as_view(), name='user-followers'),
    path('users/<str:username>/following/', FollowingListView.as_view(), name='user-following'),
]
