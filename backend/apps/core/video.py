"""Видео-пайплайн: валидация + извлечение постера (первого кадра) через ffmpeg.

Без перекодирования: оригинал хранится как есть. ffmpeg/ffprobe — системные
бинарники; если их нет, обработка деградирует мягко (видео сохраняется без
постера, размеры/длительность берём что есть, длительность не проверяем).
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Optional

from apps.core.images import compute_orientation_kind, process_image_bytes

logger = logging.getLogger(__name__)

# Типы и лимиты (mov принимается, но без перекодирования играет не везде).
ALLOWED_VIDEO_MIME = frozenset({
    'video/mp4', 'video/webm', 'video/quicktime',
})
MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB
MAX_VIDEO_DURATION_SECONDS = 300  # 5 минут

_FFMPEG = shutil.which('ffmpeg')
_FFPROBE = shutil.which('ffprobe')


class VideoValidationError(ValueError):
    """Видео не прошло серверную валидацию (тип/размер/длительность)."""


def ffmpeg_available() -> bool:
    return bool(_FFMPEG and _FFPROBE)


def _probe(path: str) -> dict:
    """ffprobe → {duration_ms, width, height} (мягко, при ошибке пусто)."""
    if not _FFPROBE:
        return {}
    try:
        out = subprocess.run(
            [
                _FFPROBE, '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', path,
            ],
            capture_output=True, timeout=30, check=True,
        )
        data = json.loads(out.stdout or b'{}')
    except (subprocess.SubprocessError, ValueError, OSError) as e:
        logger.warning('ffprobe failed: %s', e)
        return {}

    result: dict = {}
    fmt = data.get('format') or {}
    try:
        if fmt.get('duration') is not None:
            result['duration_ms'] = int(float(fmt['duration']) * 1000)
    except (TypeError, ValueError):
        pass
    for stream in data.get('streams', []):
        if stream.get('codec_type') == 'video':
            w, h = stream.get('width'), stream.get('height')
            if w and h:
                result['width'] = int(w)
                result['height'] = int(h)
            break
    return result


def _extract_poster_bytes(path: str) -> Optional[bytes]:
    """Первый кадр → JPEG-байты через ffmpeg (None если недоступно/ошибка)."""
    if not _FFMPEG:
        return None
    try:
        out = subprocess.run(
            [
                _FFMPEG, '-y', '-loglevel', 'error', '-i', path,
                '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1',
            ],
            capture_output=True, timeout=60, check=True,
        )
        return out.stdout or None
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning('ffmpeg poster extraction failed: %s', e)
        return None


def _suffix_for(ct: str) -> str:
    if ct == 'video/webm':
        return '.webm'
    if ct == 'video/quicktime':
        return '.mov'
    return '.mp4'


def validate_video(uploaded) -> None:
    """Дешёвая проверка типа/размера (без чтения файла). Бросает VideoValidationError."""
    ct = (getattr(uploaded, 'content_type', None) or '').lower().strip()
    if ct not in ALLOWED_VIDEO_MIME:
        raise VideoValidationError(f'Unsupported video type: {ct or "unknown"}')
    size = getattr(uploaded, 'size', None) or 0
    if size > MAX_VIDEO_SIZE_BYTES:
        raise VideoValidationError(
            f'Video too large ({size / (1024 * 1024):.0f} MB). '
            f'Maximum allowed: {MAX_VIDEO_SIZE_BYTES // (1024 * 1024)} MB.'
        )


def process_video_upload(uploaded, original_name: str, item_id) -> dict:
    """Метаданные + постер из загруженного видео БЕЗ чтения всего файла в память.

    Оригинал сохраняет вызывающий код (присваивает FileField сам объект upload).
    Постер/длительность извлекаются только если доступен ffmpeg/ffprobe.
    Длительность сверх лимита → VideoValidationError. После работы возвращает
    указатель файла в начало, чтобы его можно было сохранить в storage.
    """
    ct = (getattr(uploaded, 'content_type', None) or '').lower().strip()
    result: dict = {
        'mime': ct,
        'duration_ms': None,
        'width': None,
        'height': None,
        'orientation_kind': 'landscape',
        'poster': None,
        'poster_thumbnail': None,
        'poster_medium': None,
    }

    if not ffmpeg_available():
        return result

    # Большие файлы Django уже положил во временный файл на диск — работаем
    # с ним напрямую, без повторного копирования (быстрее и без лишней памяти).
    existing_path = None
    try:
        existing_path = uploaded.temporary_file_path()
    except (AttributeError, NotImplementedError):
        existing_path = None

    poster_raw = None
    tmp = None
    try:
        if existing_path:
            path = existing_path
        else:
            tmp = tempfile.NamedTemporaryFile(suffix=_suffix_for(ct), delete=False)
            uploaded.seek(0)
            for chunk in uploaded.chunks():
                tmp.write(chunk)
            tmp.flush()
            tmp.close()
            path = tmp.name

        meta = _probe(path)

        duration_ms = meta.get('duration_ms')
        if duration_ms is not None and duration_ms > MAX_VIDEO_DURATION_SECONDS * 1000:
            raise VideoValidationError(
                f'Video is too long ({duration_ms / 1000:.0f}s). '
                f'Maximum allowed: {MAX_VIDEO_DURATION_SECONDS}s.'
            )

        result['duration_ms'] = meta.get('duration_ms')
        result['width'] = meta.get('width')
        result['height'] = meta.get('height')
        result['orientation_kind'] = compute_orientation_kind(
            meta.get('width'), meta.get('height')
        )
        poster_raw = _extract_poster_bytes(path)
    finally:
        if tmp is not None:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
        try:
            uploaded.seek(0)
        except Exception:  # noqa: BLE001
            pass

    if poster_raw:
        try:
            processed = process_image_bytes(poster_raw, 'image/jpeg', original_name, item_id)
            result['poster'] = processed['image']
            result['poster_thumbnail'] = processed['image_thumbnail']
            result['poster_medium'] = processed['image_medium']
            if not result['width'] or not result['height']:
                result['width'] = processed.get('width')
                result['height'] = processed.get('height')
                result['orientation_kind'] = compute_orientation_kind(
                    processed.get('width'), processed.get('height')
                )
        except Exception as e:  # noqa: BLE001 — постер не критичен
            logger.warning('Poster processing failed for %s: %s', item_id, e)

    return result
