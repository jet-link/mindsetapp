"""Сервисный слой threads: view парсят запрос и зовут сервисы.

Вся бизнес-логика (санитизация, хэштеги, картинки, лайки, уведомления)
живет здесь — переиспользуется и в API, и в management-командах, и в Celery.
"""
from __future__ import annotations

from typing import Sequence

from django.db import transaction

from apps.core.text import html_to_plain_text
from apps.notifications.services import delete_repost_notification, delete_reply_notifications, notify

from .body_html import extract_hashtags, normalise_hashtags, render_body
from .image_service import attach_reply_image, attach_theme_images
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


def _sync_hashtags(theme: Theme, raw_body: str) -> None:
    pairs = normalise_hashtags(extract_hashtags(raw_body))
    tags: list[Hashtag] = []
    for name, slug in pairs:
        tag, _ = Hashtag.objects.get_or_create(slug=slug, defaults={'name': name})
        tags.append(tag)
    theme.hashtags.set(tags)


@transaction.atomic
def create_theme(*, author, body: str, images: Sequence = ()) -> Theme:
    html = render_body(body)
    theme = Theme.objects.create(
        author=author,
        body=html,
        body_text=html_to_plain_text(html),
    )
    _sync_hashtags(theme, body)
    if images:
        attach_theme_images(theme, images)
    return theme


@transaction.atomic
def update_theme(*, theme: Theme, body: str) -> Theme:
    html = render_body(body)
    theme.body = html
    theme.body_text = html_to_plain_text(html)
    theme.save(update_fields=['body', 'body_text', 'updated_at'])
    _sync_hashtags(theme, body)
    return theme


@transaction.atomic
def create_reply(*, theme: Theme, author, body: str, parent: Reply | None = None,
                 images: Sequence = ()) -> Reply:
    reply = Reply.objects.create(
        theme=theme,
        author=author,
        parent=parent,
        body=render_body(body),
    )
    if images:
        attach_reply_image(reply, images)
    notify(recipient=theme.author, actor=author, verb='reply', theme=theme, reply=reply)
    if parent is not None and parent.author_id != theme.author_id:
        notify(recipient=parent.author, actor=author, verb='reply', theme=theme, reply=reply)
    return reply


def toggle_theme_like(*, theme: Theme, user) -> bool:
    """Возвращает True, если лайк теперь стоит."""
    obj, created = ThemeLike.objects.get_or_create(theme=theme, user=user)
    if created:
        notify(recipient=theme.author, actor=user, verb='like_theme', theme=theme)
        return True
    obj.delete()
    return False


def toggle_theme_repost(*, theme: Theme, user) -> bool:
    obj, created = ThemeRepost.objects.get_or_create(theme=theme, user=user)
    if created:
        notify(recipient=theme.author, actor=user, verb='repost', theme=theme)
        return True
    obj.delete()
    delete_repost_notification(recipient=theme.author, actor=user, theme=theme)
    return False


def toggle_reply_like(*, reply: Reply, user) -> bool:
    obj, created = ReplyLike.objects.get_or_create(reply=reply, user=user)
    if created:
        notify(
            recipient=reply.author, actor=user, verb='like_reply',
            theme=reply.theme, reply=reply,
        )
        return True
    obj.delete()
    return False


def toggle_reply_repost(*, reply: Reply, user) -> bool:
    obj, created = ReplyRepost.objects.get_or_create(reply=reply, user=user)
    if created:
        return True
    obj.delete()
    return False


def share_theme(*, theme: Theme, user) -> bool:
    """Учитывает шэр темы. Один пользователь = +1 к счетчику ровно один раз
    (защита от накрутки). Возвращает True, если это новый шэр."""
    _, created = ThemeShare.objects.get_or_create(theme=theme, user=user)
    return created


def soft_delete_theme(*, theme: Theme) -> None:
    if theme.is_deleted:
        return
    theme.is_deleted = True
    theme.save(update_fields=['is_deleted', 'updated_at'])


def soft_delete_reply(*, reply: Reply) -> dict:
    """Мягкое удаление ответа; возвращает обновлённые счётчики для API."""
    from django.db.models import F
    from django.db.models.functions import Greatest

    if reply.is_deleted:
        theme = Theme.objects.get(pk=reply.theme_id)
        payload = {
            'theme_id': reply.theme_id,
            'parent_id': reply.parent_id,
            'theme_replies_count': theme.replies_count,
        }
        if reply.parent_id:
            parent = Reply.objects.get(pk=reply.parent_id)
            payload['parent_replies_count'] = parent.replies_count
        return payload

    delete_reply_notifications(reply=reply)

    reply.is_deleted = True
    reply.save(update_fields=['is_deleted', 'updated_at'])

    if reply.parent_id is None:
        Theme.objects.filter(pk=reply.theme_id).update(
            replies_count=Greatest(F('replies_count') - 1, 0),
        )
    else:
        Reply.objects.filter(pk=reply.parent_id).update(
            replies_count=Greatest(F('replies_count') - 1, 0),
        )

    theme = Theme.objects.get(pk=reply.theme_id)
    payload = {
        'theme_id': reply.theme_id,
        'parent_id': reply.parent_id,
        'theme_replies_count': theme.replies_count,
    }
    if reply.parent_id:
        parent = Reply.objects.get(pk=reply.parent_id)
        payload['parent_replies_count'] = parent.replies_count
    return payload
