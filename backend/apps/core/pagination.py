from rest_framework.pagination import CursorPagination


class CreatedAtCursorPagination(CursorPagination):
    """Курсорная пагинация по дате создания — стабильна для бесконечной ленты
    (offset-пагинация «едет» при вставке новых постов)."""

    page_size = 20
    ordering = '-created_at'
    cursor_query_param = 'cursor'


class FeedCursorPagination(CreatedAtCursorPagination):
    """Лента threads-стиля: порции по 20 постов под бесконечный скролл.

    Размер порции можно переопределить через ?limit= (с потолком max_page_size),
    чтобы клиент мог запрашивать ровно столько, сколько ему нужно."""

    page_size = 20
    page_size_query_param = 'limit'
    max_page_size = 50


class IdCursorPagination(CursorPagination):
    """Курсорная пагинация по id — для списков без поля created_at (например User)."""

    page_size = 30
    ordering = '-id'
    cursor_query_param = 'cursor'


class RepostedAtCursorPagination(CreatedAtCursorPagination):
    """Репосты профиля: сортировка по времени самого репоста (annotate reposted_at),
    а не по дате создания темы — чтобы свежие репосты были сверху."""

    ordering = '-reposted_at'
