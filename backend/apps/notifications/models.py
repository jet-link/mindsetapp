from django.conf import settings
from django.db import models


class Notification(models.Model):
    """actor совершил verb над контентом recipient'а.

    theme_id/reply_id вместо GenericForeignKey: дешевле по запросам
    и достаточно для нашего фиксированного набора событий.
    """

    VERB_CHOICES = (
        ('follow', 'Followed you'),
        ('like_theme', 'Liked your theme'),
        ('like_reply', 'Liked your reply'),
        ('reply', 'Replied to your theme'),
        ('repost', 'Reposted your theme'),
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='+',
    )
    verb = models.CharField(max_length=16, choices=VERB_CHOICES)
    theme = models.ForeignKey(
        'threads.Theme', on_delete=models.CASCADE, null=True, blank=True, related_name='+'
    )
    reply = models.ForeignKey(
        'threads.Reply', on_delete=models.CASCADE, null=True, blank=True, related_name='+'
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'is_read']),
        ]

    def __str__(self) -> str:
        return f'{self.actor_id} {self.verb} → {self.recipient_id}'
