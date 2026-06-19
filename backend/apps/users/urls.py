from django.urls import path

from .search_views import (
    DiscoverSearchView,
    PopularQueriesView,
    RankedUserSearchView,
    SearchEventCreateView,
    ThemeSearchView,
)
from .views import (
    FollowersListView,
    FollowingListView,
    FollowToggleView,
    MeView,
    UserProfileView,
)

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('search/discover/', DiscoverSearchView.as_view(), name='search-discover'),
    path('search/popular/', PopularQueriesView.as_view(), name='search-popular'),
    path('search/events/', SearchEventCreateView.as_view(), name='search-events'),
    path('search/themes/', ThemeSearchView.as_view(), name='search-themes'),
    path('users/search/', RankedUserSearchView.as_view(), name='user-search'),
    path('users/<str:username>/', UserProfileView.as_view(), name='user-profile'),
    path('users/<str:username>/follow/', FollowToggleView.as_view(), name='user-follow'),
    path('users/<str:username>/followers/', FollowersListView.as_view(), name='user-followers'),
    path('users/<str:username>/following/', FollowingListView.as_view(), name='user-following'),
]
