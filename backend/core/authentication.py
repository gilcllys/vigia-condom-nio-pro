import logging

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from core.models import User

logger = logging.getLogger(__name__)


class SupabaseUser:
    """Lightweight user object attached to ``request.user``."""

    def __init__(self, db_user: User, auth_user_id: str):
        self.id = db_user.id
        self.auth_user_id = auth_user_id
        self.name = db_user.full_name
        self.email = db_user.email
        self.is_authenticated = True


class SupabaseJWTAuthentication(BaseAuthentication):
    """Validates Supabase-issued JWTs and resolves the internal ``nfe_vigia.users`` row."""

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header[7:]
        secret = settings.SUPABASE_JWT_SECRET
        if not secret:
            raise AuthenticationFailed("SUPABASE_JWT_SECRET não configurado no servidor.")

        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Token expirado.")
        except jwt.InvalidTokenError as exc:
            raise AuthenticationFailed(f"Token inválido: {exc}")

        auth_user_id = payload.get("sub")
        if not auth_user_id:
            raise AuthenticationFailed("Token sem subject (sub).")

        try:
            db_user = User.objects.get(auth_user_id=auth_user_id)
        except User.DoesNotExist:
            raise AuthenticationFailed("Usuário não encontrado.")

        return (SupabaseUser(db_user, auth_user_id), token)
