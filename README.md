# Mindset

Threads-подобная соцсеть. Монорепо: Django REST API + Next.js SPA.
Доменная логика перенесена и адаптирована из `deployed_blog-main/liveblog_project/mindset`.

## Структура

```
mindset/
├── backend/                  # Django 5 + DRF — чистый REST API, без шаблонов
│   ├── manage.py
│   ├── config/               # settings (base/dev/prod), urls, celery
│   ├── apps/
│   │   ├── core/             # общие утилиты: bleach-санитизация, WebP-пайплайн, пагинация
│   │   ├── users/            # кастомный User (avatar, bio, счетчики) — с первого дня
│   │   ├── threads/          # Theme/Reply/Like/Repost/Hashtag + services.py
│   │   ├── follows/          # Follow + денормализованные счетчики
│   │   └── notifications/    # уведомления (follow/like/reply/repost)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                 # Next.js (App Router): лента / тред / профиль / тег / логин
├── docker-compose.yml        # Postgres 16 + Redis 7 для локалки
└── .venv/                    # виртуальное окружение Python
```

## Быстрый старт

```bash
# 0. Окружение (venv уже создан в .venv)
source .venv/bin/activate
cp backend/.env.example .env      # уже сделано при сетапе

# 1. БД: Postgres + Redis (OrbStack установлен; если docker нет в PATH —
#    откройте OrbStack.app и завершите первичную настройку)
docker compose up -d
# Контейнерные порты сдвинуты, чтобы не конфликтовать с локальными
# Homebrew-сервисами: Postgres → 5433, Redis → 6380 (см. .env)
# Без Docker (временно): USE_SQLITE=1 в .env

# 2. Backend
python backend/manage.py migrate
python backend/manage.py createsuperuser
python backend/manage.py runserver          # http://127.0.0.1:8000

# 3. Frontend (отдельный терминал)
cd frontend && npm run dev                  # http://localhost:3000

# 4. Celery (понадобится для фоновых задач)
celery -A config worker -l info --workdir backend
```

- Swagger: http://127.0.0.1:8000/api/docs/
- OpenAPI-схема (для генерации типов фронта/мобилки): http://127.0.0.1:8000/api/schema/
- Админка: http://127.0.0.1:8000/admin/

## API v1

```
POST   /api/v1/auth/register/          # регистрация
POST   /api/v1/auth/token/             # JWT (access + refresh)
POST   /api/v1/auth/token/refresh/
GET    /api/v1/feed/?tab=for-you|following&cursor=...
POST   /api/v1/themes/                 # создать пост (multipart: body + images[] до 3)
GET    /api/v1/themes/{id}/            # тред с ответами
PATCH  /api/v1/themes/{id}/            # редактирование (12 ч с момента публикации)
DELETE /api/v1/themes/{id}/            # soft-delete
POST   /api/v1/themes/{id}/like/       # toggle
POST   /api/v1/themes/{id}/repost/     # toggle
POST   /api/v1/themes/{id}/replies/    # ответ (body, parent_id?, images[] до 1)
POST   /api/v1/replies/{id}/like/      # toggle
GET    /api/v1/users/{username}/
GET    /api/v1/users/{username}/themes/
POST   /api/v1/users/{username}/follow/  # toggle
GET    /api/v1/me/                     # PATCH — avatar, bio
GET    /api/v1/tags/{slug}/themes/
GET    /api/v1/notifications/          # POST /notifications/read/ — пометить прочитанными
```

## Что перенесено из liveblog и что изменено

Перенесено (проверенный опыт):
- Модели `Theme`, `Reply`, лайки/репосты отдельными таблицами с `unique_together`,
  денормализованные счетчики через сигналы, `Hashtag`, `Follow` (бывш. `MindsetFollow`)
- Пайплайн картинок: WebP-варианты thumbnail(300)/medium(800)/large(1600) + srcset
- `body_text`-проекция для поиска/превью, санитизация через bleach,
  linkify хэштегов и URL, YouTube-постеры вместо iframe

Сделано иначе:
- **Кастомный User** (`AUTH_USER_MODEL = users.User`) с avatar/bio/счетчиками — с первого дня
- **DRF** вместо ручных JsonResponse: сериализаторы, ViewSets, cursor-пагинация ленты
- **JWT (simplejwt) + session** — мобильное приложение подключится к тому же API
- **Сервисный слой** (`threads/services.py`, `follows/services.py`) — view только
  парсят запрос; вся логика переиспользуема в Celery/командах
- **OpenAPI** (drf-spectacular) — автодокументация и генерация типов
- Хэштеги в body ссылаются на фронтовый роут `/tags/{slug}` (настройка
  `MINDSET_TAG_URL_TEMPLATE`), а не на Django-вью

## Дорожная карта

1. **MVP (готово)** — регистрация/JWT, посты, лента (for-you/following), лайки,
   репосты, ответы, подписки, хэштеги, профили, уведомления, Swagger
2. **Ближайшее**
   - Загрузка картинок с фронта (multipart-форма в Composer)
   - Аватары: ресайз через тот же WebP-пайплайн
   - Пагинация ответов в треде + второй уровень вложенности в UI
   - Экран уведомлений + счетчик непрочитанных
   - allauth: Google/Apple → выдача JWT (dj-rest-auth или свой адаптер)
3. **Дальше**
   - For-you-ранжирование (свежесть + вовлеченность), trending-теги (Redis)
   - Полнотекстовый поиск по `body_text` (Postgres FTS)
   - Celery: счетчики-реконсиляция, очистка осиротевших файлов, digest-уведомления
   - Rate-limit на запись, бан/модерация, репорты
   - React Native: тот же API v1, типы из OpenAPI-схемы

## Тонкости

- Dev-настройки: `config.settings.dev` (default в manage.py), prod: `config.settings.prod`
- `USE_SQLITE=1` — аварийный режим без Docker; основная dev-БД — Postgres,
  как в проде (совпадение dev/prod окружений)
- Счетчики (`likes_count`, `followers_count`, …) обновляются сигналами через
  `F()`-выражения — без гонок; периодическую реконсиляцию добавим в Celery beat
