from rest_framework.permissions import BasePermission

from core.models import UserCondo


class IsCondoAdmin(BasePermission):
    """Checks that the authenticated user has ADMIN or SINDICO role for the condo_id in the request."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not getattr(user, "is_authenticated", False):
            return False

        condo_id = (
            request.data.get("condo_id")
            or request.data.get("condoId")
            or request.query_params.get("condo_id")
        )
        if not condo_id:
            return False

        return UserCondo.objects.filter(
            user_id=user.id,
            condo_id=condo_id,
            role__in=["ADMIN", "SINDICO"],
            status="ativo",
        ).exists()
