from rest_framework import serializers

from apps.users.serializers import UserPublicSerializer

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserPublicSerializer(read_only=True)
    theme_id = serializers.IntegerField(read_only=True, allow_null=True)
    reply_id = serializers.IntegerField(read_only=True, allow_null=True)
    reply_parent_id = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            'id', 'actor', 'verb', 'theme_id', 'reply_id',
            'reply_parent_id', 'is_read', 'created_at',
        )
        read_only_fields = fields

    def get_reply_parent_id(self, obj) -> int | None:
        if obj.reply_id and obj.reply:
            return obj.reply.parent_id
        return None
