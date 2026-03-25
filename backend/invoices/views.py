import logging

import anthropic
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from services.anthropic_service import EMPTY_NF, extract_nf

from .serializers import ExtractNFSerializer

logger = logging.getLogger(__name__)


class ExtractNFView(APIView):
    """POST /api/invoices/extract/ — replaces extract-nf edge function."""

    def post(self, request):
        serializer = ExtractNFSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_base64 = serializer.validated_data["fileBase64"]
        media_type = serializer.validated_data["mediaType"]

        try:
            result = extract_nf(file_base64, media_type)
        except anthropic.RateLimitError:
            return Response(
                {"error": "Limite de requisições excedido. Tente novamente em alguns instantes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except anthropic.APIStatusError as exc:
            if exc.status_code == 402:
                return Response({"error": "Créditos insuficientes na API."}, status=402)
            logger.error("Claude API error: %s", exc)
            return Response({"error": f"Claude API error: {exc.status_code}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as exc:
            logger.error("extract-nf error: %s", exc)
            return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(result)
