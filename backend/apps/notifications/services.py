from __future__ import annotations

from .models import Notification


def notify(*, recipient, actor, verb: str, theme=None, reply=None) -> Notification | None:
    """Создает уведомление; самоуведомления молча пропускаем."""
    if recipient.pk == actor.pk:
        return None
    return Notification.objects.create(
        recipient=recipient, actor=actor, verb=verb, theme=theme, reply=reply
    )
