"""Пересчёт replies_count: только ответы первого уровня (parent IS NULL)."""

from django.db import migrations


def recalc_theme_replies_count(apps, schema_editor):
    Theme = apps.get_model('threads', 'Theme')
    Reply = apps.get_model('threads', 'Reply')
    for theme in Theme.objects.all().only('pk'):
        count = Reply.objects.filter(
            theme_id=theme.pk,
            parent__isnull=True,
            is_deleted=False,
        ).count()
        Theme.objects.filter(pk=theme.pk).update(replies_count=count)


class Migration(migrations.Migration):

    dependencies = [
        ('threads', '0003_theme_shares_count_themeshare'),
    ]

    operations = [
        migrations.RunPython(recalc_theme_replies_count, migrations.RunPython.noop),
    ]
