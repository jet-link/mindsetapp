from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserPublicSerializer(serializers.ModelSerializer):
    """Карточка автора в ленте/треде."""

    avatar = serializers.ImageField(read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'avatar', 'bio')
        read_only_fields = fields


class UserCardSerializer(serializers.ModelSerializer):
    """Строка пользователя в списках Followers/Following + флаг подписки
    текущего пользователя (для кнопки Follow/Unfollow)."""

    avatar = serializers.ImageField(read_only=True)
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'avatar', 'bio', 'is_following')
        read_only_fields = fields

    def get_is_following(self, obj) -> bool:
        ids = self.context.get('following_ids')
        if ids is not None:
            return obj.pk in ids
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.followers.filter(follower=request.user).exists()


class UserProfileSerializer(serializers.ModelSerializer):
    """Полный публичный профиль + флаг подписки текущего пользователя.

    replies/media/reposts-счетчики считаются на лету: они нужны только
    на странице профиля (одиночный объект), денормализация не оправдана.
    """

    is_following = serializers.SerializerMethodField()
    replies_count = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()
    reposts_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'username', 'avatar', 'bio',
            'followers_count', 'following_count', 'themes_count',
            'replies_count', 'media_count', 'reposts_count',
            'date_joined', 'is_following',
        )
        read_only_fields = fields

    def get_is_following(self, obj) -> bool:
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        following_ids = self.context.get('following_ids')
        if following_ids is not None:
            return obj.pk in following_ids
        return obj.followers.filter(follower=request.user).exists()

    def get_replies_count(self, obj) -> int:
        from apps.threads.models import Reply

        return Reply.objects.filter(author=obj, is_deleted=False).count()

    def get_media_count(self, obj) -> int:
        from apps.threads.models import ReplyMedia, ThemeMedia

        theme_media = ThemeMedia.objects.filter(
            theme__author=obj, theme__is_deleted=False,
        ).count()
        reply_media = ReplyMedia.objects.filter(
            reply__author=obj,
            reply__is_deleted=False,
            reply__theme__is_deleted=False,
        ).count()
        return theme_media + reply_media

    def get_reposts_count(self, obj) -> int:
        from apps.threads.models import ReplyRepost, ThemeRepost

        theme_reposts = ThemeRepost.objects.filter(user=obj).count()
        reply_reposts = ReplyRepost.objects.filter(user=obj).count()
        return theme_reposts + reply_reposts


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Email address is already registered!')
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class MeSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'avatar', 'bio',
            'followers_count', 'following_count', 'themes_count',
        )
        read_only_fields = (
            'id', 'username', 'email',
            'followers_count', 'following_count', 'themes_count',
        )

    def validate_bio(self, value: str) -> str:
        value = (value or '').replace('\r\n', '\n').replace('\r', '\n')
        if len(value) > 150:
            raise serializers.ValidationError(
                'Bio must be 150 characters or fewer.'
            )
        return value

    def update(self, instance, validated_data):
        if 'avatar' in validated_data and validated_data['avatar'] is None:
            if instance.avatar:
                instance.avatar.delete(save=False)
            instance.avatar = None
            validated_data.pop('avatar')
        return super().update(instance, validated_data)
