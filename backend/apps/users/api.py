from django.contrib.auth import get_user_model
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.i18n import t

from .serializers import RegisterSerializer

UserModel = get_user_model()

LOGIN_CODE_USER_NOT_FOUND = "user_not_found"
LOGIN_CODE_PASSWORD_INCORRECT = "password_incorrect"


def _short_register_errors(errors: dict) -> dict:
    """DRF-ошибки валидации → короткие локализованные сообщения по полям формы."""
    out: dict[str, str] = {}

    if errors.get('username'):
        msg = str(errors['username'][0]).lower()
        out['username'] = t(
            'register.userExists'
            if any(k in msg for k in ('already', 'exist', 'unique'))
            else 'register.usernameInvalid'
        )

    if errors.get('email'):
        msg = str(errors['email'][0]).lower()
        out['email'] = t(
            'register.emailRegistered'
            if any(k in msg for k in ('already', 'exist', 'unique', 'in use', 'registered'))
            else 'register.emailInvalid'
        )

    if errors.get('password'):
        msg = str(errors['password'][0]).lower()
        if 'common' in msg:
            out['password'] = t('register.passwordCommon')
        elif any(k in msg for k in ('short', 'at least', 'characters')):
            out['password'] = t('register.passwordShort')
        elif 'numeric' in msg:
            out['password'] = t('register.passwordNumeric')
        elif 'similar' in msg:
            out['password'] = t('register.passwordSimilar')
        else:
            out['password'] = t('register.passwordInvalid')

    return out


def resolve_login_error(username: str, password: str) -> tuple[str, str] | None:
    """None — credentials OK; иначе (code, message) для формы входа."""
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        return LOGIN_CODE_USER_NOT_FOUND, t('login.userNotFound')

    try:
        user = UserModel.objects.get(username=username)
    except UserModel.DoesNotExist:
        return LOGIN_CODE_USER_NOT_FOUND, t('login.userNotFound')

    if not user.is_active:
        return LOGIN_CODE_USER_NOT_FOUND, t('login.userNotFound')

    if not user.check_password(password):
        return LOGIN_CODE_PASSWORD_INCORRECT, t('login.passwordIncorrect')

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
