from rest_framework import serializers

from apps.users.serializers import UserPublicSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserPublicSerializer(read_only=True)
    theme_id = serializers.IntegerField(read_only=True, allow_null=True)
    reply_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = ('id', 'actor', 'verb', 'theme_id', 'reply_id', 'is_read', 'created_at')
        read_only_fields = fields
