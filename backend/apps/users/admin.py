from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ('username', 'email', 'followers_count', 'following_count',
                    'themes_count', 'is_staff', 'date_joined')
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Mindset', {'fields': ('avatar', 'bio', 'followers_count',
                                'following_count', 'themes_count')}),
    )
    readonly_fields = ('followers_count', 'following_count', 'themes_count')
