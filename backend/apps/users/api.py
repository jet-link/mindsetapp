from django.contrib.auth import get_user_model
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer

UserModel = get_user_model()

LOGIN_MSG_USER_NOT_FOUND = "User not found"
LOGIN_MSG_PASSWORD_INCORRECT = "Password incorrectly"

LOGIN_CODE_USER_NOT_FOUND = "user_not_found"
LOGIN_CODE_PASSWORD_INCORRECT = "password_incorrect"


def _short_register_errors(errors: dict) -> dict:
    """DRF-ошибки валидации → короткие сообщения по конкретным полям формы."""
    out: dict[str, str] = {}

    if errors.get('username'):
        msg = str(errors['username'][0]).lower()
        out['username'] = (
            'User already exist'
            if any(k in msg for k in ('already', 'exist', 'unique'))
            else 'Username incorrectly'
        )

    if errors.get('email'):
        msg = str(errors['email'][0]).lower()
        out['email'] = (
            'Email address is already registered!'
            if any(k in msg for k in ('already', 'exist', 'unique', 'in use', 'registered'))
            else 'Email incorrectly'
        )

    if errors.get('password'):
        msg = str(errors['password'][0]).lower()
        if 'common' in msg:
            out['password'] = 'Password is too common'
        elif any(k in msg for k in ('short', 'at least', 'characters')):
            out['password'] = 'Password is too short'
        elif 'numeric' in msg:
            out['password'] = 'Password is entirely numeric'
        elif 'similar' in msg:
            out['password'] = 'Password is too similar to personal info'
        else:
            out['password'] = 'Password is invalid'

    return out


def resolve_login_error(username: str, password: str) -> tuple[str, str] | None:
    """None — credentials OK; иначе (code, message) для формы входа."""
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        return LOGIN_CODE_USER_NOT_FOUND, LOGIN_MSG_USER_NOT_FOUND

    try:
        user = UserModel.objects.get(username=username)
    except UserModel.DoesNotExist:
        return LOGIN_CODE_USER_NOT_FOUND, LOGIN_MSG_USER_NOT_FOUND

    if not user.is_active:
        return LOGIN_CODE_USER_NOT_FOUND, LOGIN_MSG_USER_NOT_FOUND

    if not user.check_password(password):
        return LOGIN_CODE_PASSWORD_INCORRECT, LOGIN_MSG_PASSWORD_INCORRECT

    return None


class LoginView(APIView):
    """POST /auth/login/ — вход с разными сообщениями об ошибке."""

    permission_classes = (permissions.AllowAny,)
    throttle_scope = "anon"

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        error = resolve_login_error(username, password)
        if error:
            code, message = error
            return Response({"ok": False, "code": code, "message": message})
        user = UserModel.objects.get(username=(username or "").strip())
        refresh = RefreshToken.for_user(user)
        return Response({
            "ok": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        })


class RegisterView(APIView):
    """POST /auth/register/ — регистрация со структурированными ошибками полей.

    Как и LoginView, при ошибке валидации возвращаем 200 с {ok: false, errors},
    чтобы браузер не писал в консоль 'Failed to load resource: 400'. Фронт сам
    подсвечивает некорректные поля по ключам errors.
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"ok": False, "errors": _short_register_errors(serializer.errors)}
            )
        serializer.save()
        return Response({"ok": True})
