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
        from apps.threads.models import Theme

        return (
            Theme.objects
            .filter(author=obj, is_deleted=False, images__isnull=False)
            .distinct()
            .count()
        )

    def get_reposts_count(self, obj) -> int:
        from apps.threads.models import ThemeRepost

        return ThemeRepost.objects.filter(user=obj).count()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

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
        value = value or ''
        plain = value.replace('\r\n', '').replace('\r', '').replace('\n', '')
        if len(plain) > 150:
            raise serializers.ValidationError(
                'Bio must be 150 characters or fewer (line breaks do not count).'
            )
        return value

    def update(self, instance, validated_data):
        if 'avatar' in validated_data and validated_data['avatar'] is None:
            if instance.avatar:
                instance.avatar.delete(save=False)
            instance.avatar = None
            validated_data.pop('avatar')
        return super().update(instance, validated_data)
