"""Денормализованные счетчики подписок на User."""
from django.contrib.auth import get_user_model
from django.db.models import F
from django.db.models.functions import Greatest
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Follow

User = get_user_model()


@receiver(post_save, sender=Follow)
def _follow_created(sender, instance, created, **kwargs):
    if not created:
        return
    User.objects.filter(pk=instance.follower_id).update(
        following_count=F('following_count') + 1
    )
    User.objects.filter(pk=instance.followee_id).update(
        followers_count=F('followers_count') + 1
    )


@receiver(post_delete, sender=Follow)
def _follow_deleted(sender, instance, **kwargs):
    User.objects.filter(pk=instance.follower_id).update(
        following_count=Greatest(F('following_count') - 1, 0)
    )
    User.objects.filter(pk=instance.followee_id).update(
        followers_count=Greatest(F('followers_count') - 1, 0)
    )
