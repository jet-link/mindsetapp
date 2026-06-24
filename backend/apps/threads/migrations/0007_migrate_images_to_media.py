"""Перенос существующих ThemeImage/ReplyImage в единые ThemeMedia/ReplyMedia.

Файлы физически не перемещаем — копируем только имена (оба указывают на MEDIA_ROOT).
Все перенесённые записи получают kind='image'.
"""
from django.db import migrations


def copy_images_forward(apps, schema_editor):
    ThemeImage = apps.get_model('threads', 'ThemeImage')
    ReplyImage = apps.get_model('threads', 'ReplyImage')
    ThemeMedia = apps.get_model('threads', 'ThemeMedia')
    ReplyMedia = apps.get_model('threads', 'ReplyMedia')

    theme_rows = []
    for img in ThemeImage.objects.all().iterator():
        theme_rows.append(ThemeMedia(
            theme_id=img.theme_id,
            kind='image',
            image=img.image.name if img.image else None,
            image_thumbnail=img.image_thumbnail.name if img.image_thumbnail else None,
            image_medium=img.image_medium.name if img.image_medium else None,
            width=img.width,
            height=img.height,
            sort_order=img.sort_order,
            orientation_kind=img.orientation_kind,
            uploaded_at=img.uploaded_at,
        ))
    if theme_rows:
        ThemeMedia.objects.bulk_create(theme_rows, batch_size=500)

    reply_rows = []
    for img in ReplyImage.objects.all().iterator():
        reply_rows.append(ReplyMedia(
            reply_id=img.reply_id,
            kind='image',
            image=img.image.name if img.image else None,
            image_thumbnail=img.image_thumbnail.name if img.image_thumbnail else None,
            image_medium=img.image_medium.name if img.image_medium else None,
            width=img.width,
            height=img.height,
            sort_order=0,
            uploaded_at=img.uploaded_at,
        ))
    if reply_rows:
        ReplyMedia.objects.bulk_create(reply_rows, batch_size=500)


def copy_images_backward(apps, schema_editor):
    ThemeMedia = apps.get_model('threads', 'ThemeMedia')
    ReplyMedia = apps.get_model('threads', 'ReplyMedia')
    ThemeMedia.objects.filter(kind='image').delete()
    ReplyMedia.objects.filter(kind='image').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('threads', '0006_replymedia_thememedia'),
    ]

    operations = [
        migrations.RunPython(copy_images_forward, copy_images_backward),
    ]
