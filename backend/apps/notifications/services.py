from __future__ import annotations

from .models import Notification


def notify(*, recipient, actor, verb: str, theme=None, reply=None) -> Notification | None:
    """Создает уведомление; самоуведомления молча пропускаем."""
    if recipient.pk == actor.pk:
        return None
    return Notification.objects.create(
        recipient=recipient, actor=actor, verb=verb, theme=theme, reply=reply
    )


def delete_repost_notification(*, recipient, actor, theme) -> int:
    """Удаляет уведомление о репосте, когда пользователь снял репост."""
    deleted, _ = Notification.objects.filter(
        recipient=recipient,
        actor=actor,
        verb='repost',
        theme=theme,
    ).delete()
    return deleted


def delete_reply_notifications(*, reply) -> int:
    """Удаляет уведомления об ответе, когда reply удалён или недоступен."""
    deleted, _ = Notification.objects.filter(
        verb='reply',
        reply=reply,
    ).delete()
    return deleted


def purge_stale_notifications(*, recipient) -> int:
    """Чистит уведомления с reply/repost, которые уже недействительны."""
    from django.db.models import Exists, OuterRef

    from apps.threads.models import ThemeRepost

    deleted = 0
    n, _ = Notification.objects.filter(
        recipient=recipient,
        verb='reply',
        reply__is_deleted=True,
    ).delete()
    deleted += n

    repost_exists = ThemeRepost.objects.filter(
        theme_id=OuterRef('theme_id'),
        user_id=OuterRef('actor_id'),
    )
    n, _ = (
        Notification.objects.filter(recipient=recipient, verb='repost')
        .exclude(Exists(repost_exists))
        .delete()
    )
    deleted += n
    return deleted
