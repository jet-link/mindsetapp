from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import SearchEvent, User


@admin.register(SearchEvent)
class SearchEventAdmin(admin.ModelAdmin):
    list_display = ('tab', 'query_normalized', 'user', 'created_at')
    list_filter = ('tab',)
    search_fields = ('query_normalized', 'user__username')
    readonly_fields = ('tab', 'query_normalized', 'user', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ('username', 'email', 'followers_count', 'following_count',
                    'themes_count', 'is_staff', 'date_joined')
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Mindset', {'fields': ('avatar', 'bio', 'followers_count',
                                'following_count', 'themes_count')}),
    )
    readonly_fields = ('followers_count', 'following_count', 'themes_count')
