from rest_framework.pagination import CursorPagination


class CreatedAtCursorPagination(CursorPagination):
    """Курсорная пагинация по дате создания — стабильна для бесконечной ленты
    (offset-пагинация «едет» при вставке новых постов)."""

    page_size = 20
    ordering = '-created_at'
    cursor_query_param = 'cursor'


class FeedCursorPagination(CreatedAtCursorPagination):
    """Лента threads-стиля: первая порция в 50 постов под бесконечный скролл."""

    page_size = 50


class IdCursorPagination(CursorPagination):
    """Курсорная пагинация по id — для списков без поля created_at (например User)."""

    page_size = 30
    ordering = '-id'
    cursor_query_param = 'cursor'
