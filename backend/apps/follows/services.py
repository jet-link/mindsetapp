"""Сервисный слой подписок: view только парсит запрос и зовет сервис."""
from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.notifications.services import notify

from .models import Follow

User = get_user_model()


class FollowError(ValueError):
    pass


def toggle_follow(*, follower, followee) -> bool:
    """Подписаться/отписаться. Возвращает True, если теперь подписан."""
    if follower.pk == followee.pk:
        raise FollowError('You cannot follow yourself.')
    obj, created = Follow.objects.get_or_create(follower=follower, followee=followee)
    if created:
        notify(recipient=followee, actor=follower, verb='follow')
        return True
    obj.delete()
    return False
