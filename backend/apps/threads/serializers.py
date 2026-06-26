from rest_framework import serializers

from apps.core.text import normalize_theme_body, theme_body_length, THEME_BODY_MAX_LEN

from apps.users.serializers import UserPublicSerializer

from .models import Hashtag, Reply, ReplyMedia, Theme, ThemeMedia


class MediaSerializer(serializers.Serializer):
    """Формат медиа (только фото) для тем и ответов."""

    id = serializers.IntegerField(read_only=True)
    kind = serializers.CharField(read_only=True)
    sort_order = serializers.IntegerField(read_only=True)
    width = serializers.IntegerField(read_only=True, allow_null=True)
    height = serializers.IntegerField(read_only=True, allow_null=True)
    orientation_kind = serializers.CharField(read_only=True)
    url = serializers.CharField(source='get_url', read_only=True)
    thumbnail_url = serializers.CharField(source='get_thumbnail_url', read_only=True)
    medium_url = serializers.CharField(source='get_medium_url', read_only=True)
    srcset = serializers.CharField(source='get_srcset', read_only=True)


class HashtagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hashtag
        fields = ('name', 'slug', 'themes_count')
        read_only_fields = fields


class _ViewerFlagsMixin(serializers.Serializer):
    """is_liked / is_reposted для текущего пользователя.

    Чтобы не было N+1, ViewSet кладет в context множества liked_ids /
    reposted_ids, собранные одним запросом на страницу."""

    is_liked = serializers.SerializerMethodField()
    is_reposted = serializers.SerializerMethodField()

    def _viewer_flag(self, obj, context_key: str) -> bool:
        ids = self.context.get(context_key)
        return obj.pk in ids if ids is not None else False

    def get_is_liked(self, obj) -> bool:
        return self._viewer_flag(obj, 'liked_ids')

    def get_is_reposted(self, obj) -> bool:
        return self._viewer_flag(obj, 'reposted_ids')


class ReplySerializer(_ViewerFlagsMixin, serializers.ModelSerializer):
    author = UserPublicSerializer(read_only=True)
    media = MediaSerializer(many=True, read_only=True)
    human_published = serializers.CharField(read_only=True)
    is_deletable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Reply
        fields = (
            'id', 'theme_id', 'parent_id', 'author', 'body', 'media',
            'replies_count', 'likes_count', 'reposts_count',
            'is_liked', 'is_reposted',
            'created_at', 'human_published', 'is_deletable',
        )
        read_only_fields = fields


class ProfileReplySerializer(ReplySerializer):
    """Ответ в профиле: вместе с темой и родительским ответом (если есть).

    Если пользователь ответил напрямую на тему — фронт показывает тему.
    Если ответил на чужой ответ — показываем родительский ответ (parent),
    а тему оставляем для навигации/счётчиков."""

    theme = serializers.SerializerMethodField()
    parent = serializers.SerializerMethodField()

    class Meta(ReplySerializer.Meta):
        fields = ReplySerializer.Meta.fields + ('theme', 'parent')

    def get_theme(self, reply: Reply) -> dict:
        ctx = {
            'request': self.context.get('request'),
            'liked_ids': self.context.get('theme_liked_ids', set()),
            'reposted_ids': self.context.get('theme_reposted_ids', set()),
            'shared_ids': self.context.get('theme_shared_ids', set()),
        }
        return ThemeSerializer(reply.theme, context=ctx).data

    def get_parent(self, reply: Reply):
        if not reply.parent_id:
            return None
        parent = reply.parent
        if parent is None or parent.is_deleted:
            return None
        ctx = {
            'request': self.context.get('request'),
            'liked_ids': self.context.get('parent_liked_ids', set()),
            'reposted_ids': self.context.get('parent_reposted_ids', set()),
        }
        return ReplySerializer(parent, context=ctx).data


class ThemeSerializer(_ViewerFlagsMixin, serializers.ModelSerializer):
    author = UserPublicSerializer(read_only=True)
    media = MediaSerializer(many=True, read_only=True)
    hashtags = HashtagSerializer(many=True, read_only=True)
    human_published = serializers.CharField(read_only=True)
    preview = serializers.CharField(read_only=True)
    is_shared = serializers.SerializerMethodField()
    is_deletable = serializers.BooleanField(read_only=True)

    def get_is_shared(self, obj) -> bool:
        return self._viewer_flag(obj, 'shared_ids')

    class Meta:
        model = Theme
        fields = (
            'id', 'author', 'body', 'body_text', 'preview',
            'media', 'hashtags',
            'replies_count', 'likes_count', 'reposts_count', 'shares_count',
            'is_liked', 'is_reposted', 'is_shared',
            'created_at', 'updated_at', 'human_published', 'is_editable', 'is_deletable',
        )
        read_only_fields = fields


class ProfileRepostSerializer(serializers.Serializer):
    """Элемент вкладки Reposts: репост темы или ответа."""

    kind = serializers.CharField()
    reposted_at = serializers.DateTimeField()
    theme = ThemeSerializer(required=False, allow_null=True)
    reply = ReplySerializer(required=False, allow_null=True)


class ThemeCreateSerializer(serializers.Serializer):
    """Вход на создание/редактирование темы; body — сырой HTML/текст,
    санитизация в сервисном слое."""

    body = serializers.CharField(max_length=20000, required=False, allow_blank=True, default='')
    media = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=10
    )

    def validate_body(self, value: str) -> str:
        normalized = normalize_theme_body(value)
        if theme_body_length(normalized) > THEME_BODY_MAX_LEN:
            raise serializers.ValidationError(
                f'Theme text must be at most {THEME_BODY_MAX_LEN} characters.'
            )
        return normalized


class ReplyCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=10000, required=False, allow_blank=True, default='')
    parent_id = serializers.IntegerField(required=False, allow_null=True)
    media = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=5
    )

    def validate_body(self, value: str) -> str:
        normalized = normalize_theme_body(value)
        if theme_body_length(normalized) > THEME_BODY_MAX_LEN:
            raise serializers.ValidationError(
                f'Reply text must be at most {THEME_BODY_MAX_LEN} characters.'
            )
        return normalized
