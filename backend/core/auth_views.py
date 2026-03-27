"""Auth views — proxy Supabase GoTrue API for the frontend."""

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from services import supabase_auth

logger = logging.getLogger(__name__)


class LoginView(APIView):
    """POST /api/auth/login/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "")
        password = request.data.get("password", "")
        if not email or not password:
            return Response({"error": "Email e senha são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        result = supabase_auth.sign_in_with_password(email, password)
        return Response(result["data"], status=result["status"])


class SignUpView(APIView):
    """POST /api/auth/signup/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "")
        password = request.data.get("password", "")
        redirect_to = request.data.get("redirectTo")
        if not email or not password:
            return Response({"error": "Email e senha são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        result = supabase_auth.sign_up(email, password, redirect_to)
        return Response(result["data"], status=result["status"])


class LogoutView(APIView):
    """POST /api/auth/logout/"""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        if token:
            supabase_auth.sign_out(token)
        return Response({"success": True})


class RefreshTokenView(APIView):
    """POST /api/auth/refresh/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh = request.data.get("refresh_token", "")
        if not refresh:
            return Response({"error": "refresh_token é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        result = supabase_auth.refresh_token(refresh)
        return Response(result["data"], status=result["status"])


class ForgotPasswordView(APIView):
    """POST /api/auth/forgot-password/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "")
        redirect_to = request.data.get("redirectTo")
        if not email:
            return Response({"error": "Email é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        result = supabase_auth.reset_password_for_email(email, redirect_to)
        return Response(result["data"], status=result["status"])


class UpdateUserView(APIView):
    """PUT /api/auth/update-user/ — requires auth"""

    def put(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        result = supabase_auth.update_user(token, request.data)
        return Response(result["data"], status=result["status"])


class GetUserView(APIView):
    """GET /api/auth/user/ — requires auth"""

    def get(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        result = supabase_auth.get_user(token)
        return Response(result["data"], status=result["status"])


class SessionView(APIView):
    """GET /api/auth/session/ — verify token and return user info"""

    def get(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        if not token:
            return Response({"session": None})
        result = supabase_auth.get_user(token)
        if result["status"] == 200:
            return Response({"session": {"user": result["data"], "access_token": token}})
        return Response({"session": None})


# ── MFA ──────────────────────────────────────────────────────────────────────


class MfaListFactorsView(APIView):
    """GET /api/auth/mfa/factors/"""

    def get(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        result = supabase_auth.mfa_list_factors(token)
        return Response(result["data"], status=result["status"])


class MfaEnrollView(APIView):
    """POST /api/auth/mfa/enroll/"""

    def post(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        factor_type = request.data.get("factor_type", "totp")
        friendly_name = request.data.get("friendly_name")
        result = supabase_auth.mfa_enroll(token, factor_type, friendly_name)
        return Response(result["data"], status=result["status"])


class MfaChallengeView(APIView):
    """POST /api/auth/mfa/challenge/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        factor_id = request.data.get("factorId", "")
        if not factor_id:
            return Response({"error": "factorId é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
        result = supabase_auth.mfa_challenge(token, factor_id)
        return Response(result["data"], status=result["status"])


class MfaVerifyView(APIView):
    """POST /api/auth/mfa/verify/"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        factor_id = request.data.get("factorId", "")
        challenge_id = request.data.get("challengeId", "")
        code = request.data.get("code", "")
        if not all([factor_id, challenge_id, code]):
            return Response({"error": "factorId, challengeId e code são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)
        result = supabase_auth.mfa_verify(token, factor_id, challenge_id, code)
        return Response(result["data"], status=result["status"])


class MfaUnenrollView(APIView):
    """POST /api/auth/mfa/unenroll/"""

    def post(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")
        factor_id = request.data.get("factorId", "")
        if not factor_id:
            return Response({"error": "factorId é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
        result = supabase_auth.mfa_unenroll(token, factor_id)
        return Response(result["data"], status=result["status"])


class MfaAalLevelView(APIView):
    """GET /api/auth/mfa/aal-level/ — returns AAL level + sindico check"""

    def get(self, request):
        token = request.META.get("HTTP_AUTHORIZATION", "").replace("Bearer ", "")

        # Get factors to determine AAL level
        factors_result = supabase_auth.mfa_list_factors(token)
        factors = factors_result.get("data", {})
        totp_factors = factors.get("totp", []) if isinstance(factors, dict) else []
        has_verified = any(f.get("status") == "verified" for f in totp_factors)

        # Determine current AAL level
        # If user has verified MFA factors and the token was issued after MFA verification, it's aal2
        aal_level = "aal2" if has_verified else "aal1"

        # Check if current user is sindico with aal2
        is_sindico_aal2 = False
        from core.models import User, UserCondo
        auth_user_id = getattr(request.user, "auth_user_id", None)
        if auth_user_id and has_verified:
            try:
                user = User.objects.get(auth_user_id=auth_user_id)
                is_sindico = UserCondo.objects.filter(
                    user=user,
                    role__in=["SINDICO", "ADMIN"],
                    status="ativo",
                ).exists()
                is_sindico_aal2 = is_sindico and has_verified
            except User.DoesNotExist:
                pass

        return Response({
            "currentLevel": aal_level,
            "is_sindico_aal2": is_sindico_aal2,
            "factors": factors,
        })
