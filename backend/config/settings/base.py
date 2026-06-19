"""Base settings shared by dev and prod.

Чистый REST API: никаких Django-шаблонов для бизнес-страниц,
фронтенд (Next.js) живет отдельно и ходит в /api/v1/.
"""
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
REPO_ROOT = BASE_DIR.parent

load_dotenv(REPO_ROOT / '.env')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-insecure-change-me')

DEBUG = False
ALLOWED_HOSTS: list[str] = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
    # 3rd party
    'rest_framework',
    'rest_framework_simplejwt',
    'drf_spectacular',
    'corsheaders',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    # local
    'apps.core',
    'apps.users',
    'apps.threads',
    'apps.follows',
    'apps.notifications',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'allauth.account.middleware.AccountMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        # Нужен только для admin / allauth, не для бизнес-страниц.
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --- Database (Postgres по умолчанию, как в docker-compose) ---
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB', 'mindset'),
        'USER': os.getenv('POSTGRES_USER', 'mindset'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'mindset'),
        'HOST': os.getenv('POSTGRES_HOST', '127.0.0.1'),
        'PORT': os.getenv('POSTGRES_PORT', '5432'),
    }
}

# --- Cache / Celery (Redis) ---
REDIS_URL = os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/0')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': {'CLIENT_CLASS': 'django_redis.client.DefaultClient'},
    }
}

CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)
CELERY_TASK_ALWAYS_EAGER = False

# --- Auth ---
AUTH_USER_MODEL = 'users.User'
SITE_ID = 1

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

ACCOUNT_LOGIN_METHODS = {'username', 'email'}
ACCOUNT_SIGNUP_FIELDS = ['username*', 'email*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = 'none'  # включим, когда появится почтовый бэкенд

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --- DRF / JWT / OpenAPI ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.CreatedAtCursorPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min',
        'user': '300/min',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Mindset API',
    'DESCRIPTION': 'Threads-like social network: themes, replies, likes, reposts, follows.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# --- I18N / TZ ---
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# --- Static / Media ---
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- Mindset domain settings ---
# Хэштеги в body превращаются в ссылки на фронтовый роут.
MINDSET_TAG_URL_TEMPLATE = '/tags/{slug}'
MINDSET_USER_URL_TEMPLATE = '/u/{username}'
MINDSET_EDITABLE_HOURS = 12

# --- Search ---
SEARCH_DISCOVER_CACHE_TTL = int(os.getenv('SEARCH_DISCOVER_CACHE_TTL', '900'))
SEARCH_TRENDING_CACHE_TTL = int(os.getenv('SEARCH_TRENDING_CACHE_TTL', '600'))
SEARCH_POPULAR_QUERIES_CACHE_TTL = int(os.getenv('SEARCH_POPULAR_QUERIES_CACHE_TTL', '300'))
SEARCH_MIN_HASHTAG_THEMES = int(os.getenv('SEARCH_MIN_HASHTAG_THEMES', '2'))
SEARCH_POPULAR_MIN_OCCURRENCES = int(os.getenv('SEARCH_POPULAR_MIN_OCCURRENCES', '3'))
SEARCH_POPULAR_DAYS = int(os.getenv('SEARCH_POPULAR_DAYS', '30'))
SEARCH_TRENDING_DAYS = int(os.getenv('SEARCH_TRENDING_DAYS', '7'))
SEARCH_EVENT_RETENTION_DAYS = int(os.getenv('SEARCH_EVENT_RETENTION_DAYS', '90'))
