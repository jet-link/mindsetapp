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


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to='avatars/%Y/%m/', blank=True, null=True)
    bio = models.TextField(max_length=500, blank=True)

    followers_count = models.PositiveIntegerField(default=0)
    following_count = models.PositiveIntegerField(default=0)
    themes_count = models.PositiveIntegerField(default=0)

    objects = UserManager()

    def __str__(self) -> str:
        return self.username
