"""Определение MIME изображений по magic bytes и расширению файла."""
from __future__ import annotations

import os

ALLOWED_IMAGE_MIME = frozenset({
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
})

_EXT_TO_MIME = {
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
}


def sniff_image_mime(raw: bytes, filename: str = '') -> str | None:
    """Magic bytes + расширение; None если тип не распознан."""
    if len(raw) >= 6 and raw[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if len(raw) >= 8 and raw[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if len(raw) >= 3 and raw[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if len(raw) >= 12 and raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
        return 'image/webp'

    ext = os.path.splitext(filename or '')[1].lower()
    return _EXT_TO_MIME.get(ext)


def resolve_image_content_type(
    declared: str,
    *,
    head: bytes = b'',
    filename: str = '',
) -> str | None:
    """Согласует заявленный content-type с sniffing и расширением."""
    ct = (declared or '').lower().strip()
    if ct in ALLOWED_IMAGE_MIME:
        return ct
    sniffed = sniff_image_mime(head, filename)
    if sniffed in ALLOWED_IMAGE_MIME:
        return sniffed
    return None
