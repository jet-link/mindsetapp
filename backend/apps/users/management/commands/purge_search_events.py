from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.users.models import SearchEvent


class Command(BaseCommand):
    help = 'Delete search analytics events older than SEARCH_EVENT_RETENTION_DAYS.'

    def handle(self, *args, **options):
        days = getattr(settings, 'SEARCH_EVENT_RETENTION_DAYS', 90)
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = SearchEvent.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} search events.'))
