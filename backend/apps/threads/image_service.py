"""Картинки для Theme/Reply (перенос из liveblog mindset/image_service.py).

Лимиты: Theme — до 3 картинок, Reply — 0 или 1.
"""
from __future__ import annotations

import logging
from typing import Sequence

from django.core.files.base import ContentFile
from django.db.models import Max

from apps.core.images import (
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
    compute_orientation_kind,
    process_uploaded_files_parallel,
)

from .models import Reply, ReplyImage, Theme, ThemeImage

logger = logging.getLogger(__name__)

MAX_THEME_IMAGES = 3
MAX_REPLY_IMAGES = 1


class MindsetImageError(ValueError):
    """Загрузка не прошла серверную валидацию."""


def _validate_files(files: Sequence, *, limit: int) -> list:
    file_list = [f for f in files if f]
    if len(file_list) > limit:
        raise MindsetImageError(
            f'You can attach at most {limit} image{"" if limit == 1 else "s"}.'
        )
    bad: list[str] = []
    for f in file_list:
        ct = (getattr(f, 'content_type', None) or '').lower().strip()
        if ct not in ALLOWED_MIME_TYPES:
            bad.append(f.name)
    if bad:
        raise MindsetImageError(f'Unsupported file types: {", ".join(bad)}')
    for f in file_list:
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
        if size > MAX_FILE_SIZE_BYTES:
            raise MindsetImageError(
                f'File {f.name} is too large '
                f'({size / (1024 * 1024):.1f} MB; max '
                f'{MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB).'
            )
    return file_list


def attach_theme_images(theme: Theme, files: Sequence) -> int:
    """Обработать загрузки (WebP-варианты) и привязать к теме.
    Вызывающий сам учитывает уже существующие картинки при редактировании."""
    file_list = _validate_files(files, limit=MAX_THEME_IMAGES)
    if not file_list:
        return 0

    agg = ThemeImage.objects.filter(theme=theme).aggregate(mx=Max('sort_order'))
    next_order = (agg['mx'] if agg['mx'] is not None else -1) + 1

    processed_list = process_uploaded_files_parallel(file_list, item_id=f't{theme.pk}')
    created = 0
    for i, (raw, processed) in enumerate(zip(file_list, processed_list)):
        order = next_order + i
        if processed:
            ThemeImage.objects.create(
                theme=theme,
                image=processed['image'],
                image_thumbnail=processed['image_thumbnail'],
                image_medium=processed['image_medium'],
                width=processed.get('width'),
                height=processed.get('height'),
                sort_order=order,
                orientation_kind=compute_orientation_kind(
                    processed.get('width'), processed.get('height')
                ),
            )
        else:
            raw.seek(0)
            ThemeImage.objects.create(
                theme=theme,
                image=ContentFile(
                    raw.read(), name=getattr(raw, 'name', None) or 'upload.bin'
                ),
                sort_order=order,
            )
        created += 1
    return created


def attach_reply_image(reply: Reply, files: Sequence) -> bool:
    """Привязать одну картинку к ответу, если она есть."""
    file_list = _validate_files(files, limit=MAX_REPLY_IMAGES)
    if not file_list:
        return False
    processed_list = process_uploaded_files_parallel(file_list, item_id=f'r{reply.pk}')
    raw = file_list[0]
    processed = processed_list[0] if processed_list else None
    if processed:
        ReplyImage.objects.create(
            reply=reply,
            image=processed['image'],
            image_thumbnail=processed['image_thumbnail'],
            image_medium=processed['image_medium'],
            width=processed.get('width'),
            height=processed.get('height'),
        )
    else:
        raw.seek(0)
        ReplyImage.objects.create(
            reply=reply,
            image=ContentFile(
                raw.read(), name=getattr(raw, 'name', None) or 'upload.bin'
            ),
        )
    return True
