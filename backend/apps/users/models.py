"""Кастомный User с первого дня (AUTH_USER_MODEL) — чтобы не страдать потом,
как в liveblog со стандартным auth.User.

Счетчики followers/following денормализованы и обновляются сигналами
в apps.follows. themes_count — сигналами в apps.threads.
"""
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    """Понятные ошибки при createsuperuser, если email/username уже заняты."""

    def create_superuser(self, username=None, email=None, password=None, **extra_fields):
        if email and self.filter(email__iexact=email).exists():
            existing = self.get(email__iexact=email)
            raise ValueError(
                f'User with email "{email}" already exists (username: {existing.username}). '
                'Use another email or promote that user: '
                f'User.objects.filter(username="{existing.username}").update('
                'is_superuser=True, is_staff=True)'
            )
        if username and self.filter(username__iexact=username).exists():
            raise ValueError(f'User with username "{username}" already exists.')
        return super().create_superuser(username, email, password, **extra_fields)


class Language(models.TextChoices):
    EN = 'en', 'English'
    RU = 'ru', 'Russian'
    UZ = 'uz', 'Uzbek'


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to='avatars/%Y/%m/', blank=True, null=True)
    bio = models.TextField(max_length=500, blank=True)
    language = models.CharField(
        max_length=5,
        choices=Language.choices,
        default=Language.EN,
    )

    followers_count = models.PositiveIntegerField(default=0)
    following_count = models.PositiveIntegerField(default=0)
    themes_count = models.PositiveIntegerField(default=0)

    objects = UserManager()

    def __str__(self) -> str:
        return self.username


class SearchEvent(models.Model):
    """Агрегируемые события поиска для popular queries."""

    class Tab(models.TextChoices):
        THEMES = 'themes', 'themes'
        USERS = 'users', 'users'

    tab = models.CharField(max_length=10, choices=Tab.choices, db_index=True)
    query_normalized = models.CharField(max_length=128, db_index=True)
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='search_events',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['tab', 'query_normalized', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.tab}:{self.query_normalized}'
