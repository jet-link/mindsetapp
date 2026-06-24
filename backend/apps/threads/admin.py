from django.contrib import admin

from .models import Hashtag, Reply, ReplyMedia, Theme, ThemeMedia


class ThemeMediaInline(admin.TabularInline):
    model = ThemeMedia
    extra = 0


@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    list_display = ('id', 'author', 'preview', 'replies_count', 'likes_count',
                    'reposts_count', 'is_deleted', 'created_at')
    list_filter = ('is_deleted',)
    search_fields = ('body_text', 'author__username')
    raw_id_fields = ('author',)
    inlines = (ThemeMediaInline,)


@admin.register(Reply)
class ReplyAdmin(admin.ModelAdmin):
    list_display = ('id', 'theme', 'author', 'parent', 'likes_count',
                    'is_deleted', 'created_at')
    list_filter = ('is_deleted',)
    raw_id_fields = ('theme', 'author', 'parent')


@admin.register(Hashtag)
class HashtagAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'themes_count', 'created_at')
    search_fields = ('name',)
    prepopulated_fields = {'slug': ('name',)}


@admin.register(ReplyMedia)
class ReplyMediaAdmin(admin.ModelAdmin):
    list_display = ('id', 'reply', 'kind', 'uploaded_at')
    list_filter = ('kind',)
    raw_id_fields = ('reply',)
