"""Пайплайн изображений (портировано из liveblog smart_blog/image_utils.py).

- Ограничение ширины (max 1600px), конвертация в WebP
- Варианты: thumbnail (~300w), medium (~800w), large (~1600w) — под srcset
- Проверка MIME и размера, параллельная обработка нескольких файлов
"""
from __future__ import annotations

import hashlib
import io
import logging
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = frozenset({
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
})
WEBP_QUALITY = 88
WEBP_QUALITY_PREVIEW = 85
IMAGE_PROCESS_MAX_WORKERS = 4

SIZE_THUMBNAIL = 300
SIZE_MEDIUM = 800
SIZE_LARGE = 1600

ORIENTATION_LANDSCAPE = 'landscape'
ORIENTATION_PORTRAIT = 'portrait'
ORIENTATION_WIDE = 'wide'
ORIENTATION_SQUARE = 'square'


def compute_orientation_kind(width: Optional[int], height: Optional[int]) -> str:
    """Классификация соотношения сторон для раскладки галереи."""
    if not width or not height:
        return ORIENTATION_LANDSCAPE
    w, h = int(width), int(height)
    if h <= 0:
        return ORIENTATION_LANDSCAPE
    ratio = w / h
    if ratio >= 2.0:
        return ORIENTATION_WIDE
    if ratio <= 0.82:
        return ORIENTATION_PORTRAIT
    if 0.88 <= ratio <= 1.12:
        return ORIENTATION_SQUARE
    return ORIENTATION_LANDSCAPE


def _validate_bytes(raw: bytes, content_type: str):
    ct = (content_type or '').lower().strip()
    if ct not in ALLOWED_MIME_TYPES:
        raise ValueError(f'Unsupported image type: {ct}')
    if len(raw) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f'File too large ({len(raw) / (1024 * 1024):.1f} MB). '
            f'Maximum allowed: {MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB'
        )


def _open_image(buf) -> Image.Image:
    """EXIF Orientation + конвертация в RGB."""
    img = Image.open(buf)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode == 'RGB':
        return img
    if img.mode == 'RGBA':
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])
        return background
    return img.convert('RGB')


def _resize_to_max_width(img, max_width, resample=Image.Resampling.LANCZOS):
    w, h = img.size
    if w <= max_width:
        return img
    ratio = max_width / w
    return img.resize((max_width, int(h * ratio)), resample)


def _save_webp(img, max_width, quality=WEBP_QUALITY, resample=Image.Resampling.LANCZOS):
    resized = _resize_to_max_width(img, max_width, resample)
    buf = io.BytesIO()
    resized.save(buf, format='WEBP', quality=quality, method=4)
    return buf.getvalue(), resized.width, resized.height


def _unique_storage_rel_path(item_id, suffix, original_name, sample_bytes):
    h = hashlib.sha256(sample_bytes[:65536]).hexdigest()[:12]
    base = 'img'
    if original_name:
        base = (Path(str(original_name)).stem[:30] or 'img').replace(' ', '_')
    ts = int(time.time() * 1000)
    nonce = secrets.token_hex(4)
    return f'items/{item_id}/{suffix}/{base}_{h}_{ts}_{nonce}.webp'


def process_image_bytes(raw: bytes, content_type: str, original_name: str, item_id) -> dict:
    _validate_bytes(raw, content_type)
    img = _open_image(io.BytesIO(raw))

    large_data, large_w, large_h = _save_webp(img, SIZE_LARGE)
    large_file = ContentFile(
        large_data, name=_unique_storage_rel_path(item_id, 'large', original_name, raw)
    )

    medium_data, _, _ = _save_webp(
        img, SIZE_MEDIUM, quality=WEBP_QUALITY_PREVIEW, resample=Image.Resampling.BILINEAR
    )
    medium_file = ContentFile(
        medium_data, name=_unique_storage_rel_path(item_id, 'medium', original_name, raw)
    )

    thumb_data, _, _ = _save_webp(
        img, SIZE_THUMBNAIL, quality=WEBP_QUALITY_PREVIEW, resample=Image.Resampling.BILINEAR
    )
    thumb_file = ContentFile(
        thumb_data, name=_unique_storage_rel_path(item_id, 'thumbnails', original_name, raw)
    )

    return {
        'image': large_file,
        'image_thumbnail': thumb_file,
        'image_medium': medium_file,
        'width': large_w,
        'height': large_h,
    }


def process_uploaded_files_parallel(uploaded_files, item_id, max_workers=IMAGE_PROCESS_MAX_WORKERS):
    """Читает файлы в текущем потоке, декодирование/WebP — в пуле.
    Возвращает список dict | None той же длины и порядка."""
    bundles = []
    for f in uploaded_files:
        f.seek(0)
        raw = f.read()
        ct = (getattr(f, 'content_type', None) or '').lower().strip()
        name = getattr(f, 'name', '') or 'image.bin'
        bundles.append((raw, ct, name))

    if not bundles:
        return []

    def _one(bundle):
        raw, ct, name = bundle
        try:
            return process_image_bytes(raw, ct, name, item_id)
        except Exception as e:
            logger.exception('Image processing failed for item %s: %s', item_id, e)
            return None

    n = len(bundles)
    if n == 1:
        return [_one(bundles[0])]
    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, n))) as ex:
        return list(ex.map(_one, bundles))
