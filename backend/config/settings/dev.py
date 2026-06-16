import os

from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ['*']

# Локалка без Docker: USE_SQLITE=1 переключает на файл-базу,
# чтобы можно было работать, пока Postgres не поднят.
if os.getenv('USE_SQLITE') == '1':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',  # noqa: F405
        }
    }
    CACHES = {
        'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}
    }
    CELERY_TASK_ALWAYS_EAGER = True

CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CORS_ALLOW_CREDENTIALS = True

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
