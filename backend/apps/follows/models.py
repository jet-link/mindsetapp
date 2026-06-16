"""Подписки (перенос MindsetFollow из liveblog, переименовано в Follow)."""
from django.conf import settings
from django.db import models


class Follow(models.Model):
    """``follower`` подписан на ``followee``."""

    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='following',
    )
    followee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='followers',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'followee')
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['follower', '-created_at']),
            models.Index(fields=['followee', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.follower_id} → {self.followee_id}'
