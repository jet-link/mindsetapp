"""Денормализованные счетчики Theme/Reply/Hashtag/User
(перенос из liveblog mindset/signals.py + themes_count на User)."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import F
from django.db.models.functions import Greatest
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from .models import (
    Hashtag,
    Reply,
    ReplyLike,
    ReplyRepost,
    Theme,
    ThemeLike,
    ThemeRepost,
    ThemeShare,
)

User = get_user_model()


@receiver(post_save, sender=Theme)
def _theme_created(sender, instance, created, **kwargs):
    if created:
        User.objects.filter(pk=instance.author_id).update(
            themes_count=F('themes_count') + 1
        )


@receiver(post_delete, sender=Theme)
def _theme_deleted(sender, instance, **kwargs):
    User.objects.filter(pk=instance.author_id).update(
        themes_count=Greatest(F('themes_count') - 1, 0)
    )


@receiver(post_save, sender=ThemeLike)
def _theme_like_created(sender, instance, created, **kwargs):
    if created:
        Theme.objects.filter(pk=instance.theme_id).update(likes_count=F('likes_count') + 1)


@receiver(post_delete, sender=ThemeLike)
def _theme_like_deleted(sender, instance, **kwargs):
    Theme.objects.filter(pk=instance.theme_id).update(
        likes_count=Greatest(F('likes_count') - 1, 0)
    )


@receiver(post_save, sender=ThemeRepost)
def _theme_repost_created(sender, instance, created, **kwargs):
    if created:
        Theme.objects.filter(pk=instance.theme_id).update(
            reposts_count=F('reposts_count') + 1
        )


@receiver(post_delete, sender=ThemeRepost)
def _theme_repost_deleted(sender, instance, **kwargs):
    Theme.objects.filter(pk=instance.theme_id).update(
        reposts_count=Greatest(F('reposts_count') - 1, 0)
    )


@receiver(post_save, sender=ThemeShare)
def _theme_share_created(sender, instance, created, **kwargs):
    if created:
        Theme.objects.filter(pk=instance.theme_id).update(
            shares_count=F('shares_count') + 1
        )


@receiver(post_delete, sender=ThemeShare)
def _theme_share_deleted(sender, instance, **kwargs):
    Theme.objects.filter(pk=instance.theme_id).update(
        shares_count=Greatest(F('shares_count') - 1, 0)
    )


@receiver(post_save, sender=Reply)
def _reply_created(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.parent_id is None:
        Theme.objects.filter(pk=instance.theme_id).update(
            replies_count=F('replies_count') + 1
        )
    else:
        Reply.objects.filter(pk=instance.parent_id).update(
            replies_count=F('replies_count') + 1
        )


@receiver(post_delete, sender=Reply)
def _reply_deleted(sender, instance, **kwargs):
    if instance.parent_id is None:
        Theme.objects.filter(pk=instance.theme_id).update(
            replies_count=Greatest(F('replies_count') - 1, 0)
        )
    else:
        Reply.objects.filter(pk=instance.parent_id).update(
            replies_count=Greatest(F('replies_count') - 1, 0)
        )


@receiver(post_save, sender=ReplyLike)
def _reply_like_created(sender, instance, created, **kwargs):
    if created:
        Reply.objects.filter(pk=instance.reply_id).update(likes_count=F('likes_count') + 1)


@receiver(post_delete, sender=ReplyLike)
def _reply_like_deleted(sender, instance, **kwargs):
    Reply.objects.filter(pk=instance.reply_id).update(
        likes_count=Greatest(F('likes_count') - 1, 0)
    )


@receiver(post_save, sender=ReplyRepost)
def _reply_repost_created(sender, instance, created, **kwargs):
    if created:
        Reply.objects.filter(pk=instance.reply_id).update(
            reposts_count=F('reposts_count') + 1
        )


@receiver(post_delete, sender=ReplyRepost)
def _reply_repost_deleted(sender, instance, **kwargs):
    Reply.objects.filter(pk=instance.reply_id).update(
        reposts_count=Greatest(F('reposts_count') - 1, 0)
    )


@receiver(m2m_changed, sender=Theme.hashtags.through)
def _theme_hashtags_changed(sender, instance, action, pk_set, **kwargs):
    if action == 'post_add' and pk_set:
        Hashtag.objects.filter(pk__in=pk_set).update(themes_count=F('themes_count') + 1)
    elif action == 'post_remove' and pk_set:
        Hashtag.objects.filter(pk__in=pk_set).update(
            themes_count=Greatest(F('themes_count') - 1, 0)
        )
    elif action == 'pre_clear':
        existing_ids = list(instance.hashtags.values_list('pk', flat=True))
        if existing_ids:
            Hashtag.objects.filter(pk__in=existing_ids).update(
                themes_count=Greatest(F('themes_count') - 1, 0)
            )


@receiver(post_delete, sender=Theme)
def _theme_deleted_hashtag_decrement(sender, instance, **kwargs):
    pks = list(instance.hashtags.values_list('pk', flat=True))
    if pks:
        Hashtag.objects.filter(pk__in=pks).update(
            themes_count=Greatest(F('themes_count') - 1, 0)
        )
