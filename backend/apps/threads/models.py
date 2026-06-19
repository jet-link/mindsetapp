"""Threads-модели (перенос из liveblog_project/mindset/models.py).

Theme — пост верхнего уровня; Reply — вложенный ответ.
Лайки/репосты — отдельные таблицы с unique_together, денормализованные
счетчики обновляются сигналами (см. signals.py).
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.text import human_time_relative

EDITABLE_HOURS = 12
DELETABLE_HOURS = 24


class Hashtag(models.Model):
    """#tag. ``slug`` — канонический ключ поиска."""

    name = models.CharField(max_length=64, unique=True)
    slug = models.SlugField(max_length=80, unique=True, db_index=True)
    themes_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-themes_count', 'name')

    def __str__(self) -> str:
        return f'#{self.name}'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name) or self.name.lower()
        super().save(*args, **kwargs)


class Theme(models.Model):
    """Пост верхнего уровня."""

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='themes',
    )
    body = models.TextField(help_text='Sanitised HTML')
    body_text = models.TextField(
        blank=True, help_text='Plain-text projection of body for previews/search.'
    )
    hashtags = models.ManyToManyField(Hashtag, related_name='themes', blank=True)

    replies_count = models.PositiveIntegerField(default=0)
    likes_count = models.PositiveIntegerField(default=0)
    reposts_count = models.PositiveIntegerField(default=0)
    shares_count = models.PositiveIntegerField(default=0)

    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['author', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'Theme #{self.pk} by {self.author_id}'

    @property
    def human_published(self) -> str:
        return human_time_relative(self.created_at)

    @property
    def editable_until(self):
        return self.created_at + timedelta(hours=EDITABLE_HOURS)

    @property
    def is_editable(self) -> bool:
        return timezone.now() <= self.editable_until

    @property
    def deletable_until(self):
        return self.created_at + timedelta(hours=DELETABLE_HOURS)

    @property
    def is_deletable(self) -> bool:
        return timezone.now() <= self.deletable_until

    @property
    def preview(self) -> str:
        text = (self.body_text or '').strip()
        if len(text) <= 80:
            return text
        return text[:77].rstrip() + '…'


class Reply(models.Model):
    """Ответ под Theme. ``parent`` — для второго уровня вложенности."""

    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='replies')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='replies',
    )
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, related_name='children', null=True, blank=True
    )
    body = models.TextField()

    replies_count = models.PositiveIntegerField(default=0)
    likes_count = models.PositiveIntegerField(default=0)
    reposts_count = models.PositiveIntegerField(default=0)

    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-created_at',)
        verbose_name_plural = 'replies'
        indexes = [
            models.Index(fields=['theme', 'created_at']),
            models.Index(fields=['parent', 'created_at']),
        ]

    def __str__(self) -> str:
        return f'Reply #{self.pk} on theme {self.theme_id}'

    @property
    def human_published(self) -> str:
        return human_time_relative(self.created_at)

    @property
    def editable_until(self):
        return self.created_at + timedelta(hours=EDITABLE_HOURS)

    @property
    def is_editable(self) -> bool:
        return timezone.now() <= self.editable_until

    @property
    def deletable_until(self):
        return self.created_at + timedelta(hours=DELETABLE_HOURS)

    @property
    def is_deletable(self) -> bool:
        return timezone.now() <= self.deletable_until


class ThemeImage(models.Model):
    """Картинка темы, максимум 3 на тему (лимит в сервисном слое).
    Храним WebP-варианты thumbnail/medium + большой оригинал — браузер/клиент
    выбирает дешевый вариант через srcset."""

    ORIENTATION_CHOICES = (
        ('landscape', 'Landscape'),
        ('portrait', 'Portrait'),
        ('wide', 'Ultra-wide'),
        ('square', 'Square'),
    )

    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='themes/%Y/%m/%d/')
    image_thumbnail = models.ImageField(upload_to='themes/', blank=True, null=True)
    image_medium = models.ImageField(upload_to='themes/', blank=True, null=True)
    width = models.PositiveIntegerField(blank=True, null=True)
    height = models.PositiveIntegerField(blank=True, null=True)
    sort_order = models.PositiveSmallIntegerField(default=0, db_index=True)
    orientation_kind = models.CharField(
        max_length=16, choices=ORIENTATION_CHOICES, default='landscape'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('sort_order', 'pk')

    def __str__(self) -> str:
        return f'ThemeImage #{self.pk} for theme {self.theme_id}'

    def get_url(self) -> str:
        return self.image.url if self.image else ''

    def get_thumbnail_url(self) -> str:
        return self.image_thumbnail.url if self.image_thumbnail else self.get_url()

    def get_medium_url(self) -> str:
        return self.image_medium.url if self.image_medium else self.get_url()

    def get_srcset(self) -> str:
        parts: list[str] = []
        if self.image_thumbnail:
            parts.append(f'{self.image_thumbnail.url} 300w')
        if self.image_medium:
            parts.append(f'{self.image_medium.url} 800w')
        full = self.get_url()
        if full:
            parts.append(f'{full} {self.width or 1600}w')
        return ', '.join(parts)


class ReplyImage(models.Model):
    """Одна (опциональная) картинка у ответа — UX-решение + вес страницы."""

    reply = models.OneToOneField(Reply, on_delete=models.CASCADE, related_name='image')
    image = models.ImageField(upload_to='replies/%Y/%m/%d/')
    image_thumbnail = models.ImageField(upload_to='replies/', blank=True, null=True)
    image_medium = models.ImageField(upload_to='replies/', blank=True, null=True)
    width = models.PositiveIntegerField(blank=True, null=True)
    height = models.PositiveIntegerField(blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f'ReplyImage for reply {self.reply_id}'

    def get_url(self) -> str:
        return self.image.url if self.image else ''

    def get_thumbnail_url(self) -> str:
        return self.image_thumbnail.url if self.image_thumbnail else self.get_url()

    def get_medium_url(self) -> str:
        return self.image_medium.url if self.image_medium else self.get_url()

    def get_srcset(self) -> str:
        parts: list[str] = []
        if self.image_thumbnail:
            parts.append(f'{self.image_thumbnail.url} 300w')
        if self.image_medium:
            parts.append(f'{self.image_medium.url} 800w')
        full = self.get_url()
        if full:
            parts.append(f'{full} {self.width or 1600}w')
        return ', '.join(parts)


class ThemeLike(models.Model):
    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='theme_likes'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('theme', 'user')


class ThemeRepost(models.Model):
    """Ретвит — поднимает тему в ленте репостнувшего."""

    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='reposts')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='theme_reposts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('theme', 'user')
        ordering = ('-created_at',)


class ThemeShare(models.Model):
    """Шэр темы. unique_together — борьба с накруткой: один пользователь
    увеличивает счетчик ровно один раз, повторные клики только копируют ссылку."""

    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='shares')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='theme_shares'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('theme', 'user')
        ordering = ('-created_at',)


class ReplyLike(models.Model):
    reply = models.ForeignKey(Reply, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reply_likes'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('reply', 'user')


class ReplyRepost(models.Model):
    reply = models.ForeignKey(Reply, on_delete=models.CASCADE, related_name='reposts')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reply_reposts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('reply', 'user')
        ordering = ('-created_at',)
