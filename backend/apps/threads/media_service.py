"""Медиа (только фото) для Theme/Reply.

Единый ordered-список: тема — до 10 изображений, ответ — до 5. Картинки
прогоняются через WebP-пайплайн (параллельно), кроме GIF — он хранится как есть,
чтобы сохранить анимацию. Видео не поддерживается.
"""
from __future__ import annotations

import io
import logging
import os
from typing import Sequence

from django.core.files.base import ContentFile
from django.db.models import Max

from apps.core.images import (
    compute_orientation_kind,
    process_uploaded_files_parallel,
)
from apps.core.mime import ALLOWED_IMAGE_MIME, resolve_image_content_type

from .models import Reply, ReplyMedia, Theme, ThemeMedia

logger = logging.getLogger(__name__)

MAX_THEME_MEDIA = 10
MAX_REPLY_MEDIA = 5

# Лимит исходного фото в посте: телефоны часто отдают 10–20 МБ, а на выходе
# всё равно ужимается в WebP ≤1600px, поэтому потолок выше аватарного (8 МБ).
MAX_MEDIA_IMAGE_BYTES = 25 * 1024 * 1024  # 25 MB

# image/gif хранится без конвертации (анимация), остальные → WebP.
PASSTHROUGH_IMAGE_MIME = frozenset({'image/gif'})


class MindsetMediaError(ValueError):
    """Загрузка не прошла серверную валидацию."""


def _image_dimensions(raw: bytes) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(raw)) as im:
            return im.width, im.height
    except Exception:  # noqa: BLE001
        return None, None


def _read_head(f, n: int = 16) -> bytes:
    pos = getattr(f, 'tell', lambda: 0)()
    try:
        f.seek(0)
        head = f.read(n)
        f.seek(pos)
        return head or b''
    except Exception:  # noqa: BLE001
        return b''


def _classify(f) -> tuple[str | None, int, str]:
    name = os.path.basename(getattr(f, 'name', '') or '') or 'upload.bin'
    declared = (getattr(f, 'content_type', None) or '').lower().strip()
    ct = resolve_image_content_type(declared, head=_read_head(f), filename=name) or declared
    if ct in ALLOWED_IMAGE_MIME:
        return 'image', MAX_MEDIA_IMAGE_BYTES, ct
    return None, 0, ct


def _validate(files: Sequence, *, limit: int) -> list[tuple[object, str, str, str]]:
    """Дёшево (без чтения файлов) проверяет лимит/типы/размеры.

    Возвращает [(file, kind, content_type, name)]."""
    file_list = [f for f in files if f]
    if len(file_list) > limit:
        excess = len(file_list) - limit
        kind = 'theme' if limit == MAX_THEME_MEDIA else 'reply'
        noun = 'image' if excess == 1 else 'images'
        raise MindsetMediaError(
            f'You have exceeded the image limit for this {kind}. '
            f'Please remove {excess} {noun}.'
        )

    out: list[tuple[object, str, str, str]] = []
    for f in file_list:
        kind, max_size, ct = _classify(f)
        name = os.path.basename(getattr(f, 'name', '') or '') or 'upload.bin'
        if kind is None:
            raise MindsetMediaError(f'Unsupported file type: {name}')
        size = getattr(f, 'size', None) or 0
        if size > max_size:
            raise MindsetMediaError(
                f'File {name} is too large '
                f'({size / (1024 * 1024):.1f} MB; max '
                f'{max_size / (1024 * 1024):.0f} MB).'
            )
        out.append((f, kind, ct, name))
    return out


def validate_theme_media(files: Sequence) -> None:
    _validate(files, limit=MAX_THEME_MEDIA)


def validate_reply_media(files: Sequence) -> None:
    _validate(files, limit=MAX_REPLY_MEDIA)


def _attach(model, parent_field: str, parent, files: Sequence, *, limit: int, item_id: str) -> int:
    items = _validate(files, limit=limit)
    if not items:
        return 0

    agg = model.objects.filter(**{parent_field: parent}).aggregate(mx=Max('sort_order'))
    next_order = (agg['mx'] if agg['mx'] is not None else -1) + 1

    # WebP-картинки (кроме gif) обрабатываем параллельно — это узкое место.
    parallel_files = []
    parallel_idx = []
    for idx, (f, kind, ct, _name) in enumerate(items):
        if kind == 'image' and ct not in PASSTHROUGH_IMAGE_MIME:
            f.seek(0)
            parallel_files.append(f)
            parallel_idx.append(idx)
    processed: dict[int, dict | None] = {}
    if parallel_files:
        results = process_uploaded_files_parallel(
            parallel_files, item_id=item_id, max_bytes=MAX_MEDIA_IMAGE_BYTES,
        )
        for j, idx in enumerate(parallel_idx):
            processed[idx] = results[j] if j < len(results) else None

    created = 0
    for idx, (f, kind, ct, name) in enumerate(items):
        order = next_order + idx
        base = {parent_field: parent, 'sort_order': order}

        if ct in PASSTHROUGH_IMAGE_MIME:
            f.seek(0)
            raw = f.read()
            verified = resolve_image_content_type(ct, head=raw[:16], filename=name)
            if verified != 'image/gif':
                raise MindsetMediaError(f'Unsupported file type: {name}')
            w, h = _image_dimensions(raw)
            model.objects.create(
                **base,
                kind='image',
                image=ContentFile(raw, name=name if name.lower().endswith('.gif') else 'image.gif'),
                width=w,
                height=h,
                orientation_kind=compute_orientation_kind(w, h),
                mime='image/gif',
            )
        else:
            p = processed.get(idx)
            if p:
                model.objects.create(
                    **base,
                    kind='image',
                    image=p['image'],
                    image_thumbnail=p['image_thumbnail'],
                    image_medium=p['image_medium'],
                    width=p.get('width'),
                    height=p.get('height'),
                    orientation_kind=compute_orientation_kind(p.get('width'), p.get('height')),
                    mime=ct,
                )
            else:
                f.seek(0)
                model.objects.create(
                    **base,
                    kind='image',
                    image=ContentFile(f.read(), name=name or 'upload.bin'),
                    mime=ct,
                )
        created += 1
    return created


def attach_theme_media(theme: Theme, files: Sequence) -> int:
    return _attach(
        ThemeMedia, 'theme', theme, files,
        limit=MAX_THEME_MEDIA, item_id=f't{theme.pk}',
    )


def attach_reply_media(reply: Reply, files: Sequence) -> int:
    return _attach(
        ReplyMedia, 'reply', reply, files,
        limit=MAX_REPLY_MEDIA, item_id=f'r{reply.pk}',
    )
