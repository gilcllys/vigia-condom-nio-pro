import logging
import random
import string

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Condo

from .serializers import GenerateInviteSerializer

logger = logging.getLogger(__name__)

# Same character set as the Deno function: excludes 0/O, 1/I/L
INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789"


def _generate_code(length: int = 8) -> str:
    return "".join(random.choice(INVITE_CHARS) for _ in range(length))


class GenerateInviteView(APIView):
    """POST /api/condos/invite/generate/ — replaces generate-invite edge function."""

    def post(self, request):
        serializer = GenerateInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        condo_id = str(serializer.validated_data["condoId"])
        action = serializer.validated_data.get("action")

        if action == "deactivate":
            updated = Condo.objects.filter(id=condo_id).update(invite_active=False)
            if not updated:
                return Response({"error": "Erro ao desativar"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response({"success": True})

        # Generate new invite code
        code = _generate_code()
        updated = Condo.objects.filter(id=condo_id).update(invite_code=code, invite_active=True)
        if not updated:
            return Response({"error": "Erro ao salvar convite"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"invite_code": code})
