import json
import logging

import anthropic
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from services.anthropic_service import analyze_provider_risk

from .serializers import AnalyzeRiskSerializer

logger = logging.getLogger(__name__)


class AnalyzeProviderRiskView(APIView):
    """POST /api/providers/analyze-risk/ — replaces analyze-provider-risk edge function."""

    def post(self, request):
        serializer = AnalyzeRiskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cnpj_data = serializer.validated_data["cnpjData"]

        try:
            result = analyze_provider_risk(cnpj_data)
        except json.JSONDecodeError:
            return Response(
                {"error": "Não foi possível interpretar a resposta da IA."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except anthropic.APIStatusError as exc:
            logger.error("Anthropic API error: %s", exc)
            return Response(
                {"error": f"Anthropic API error: {exc.status_code}"},
                status=exc.status_code,
            )
        except Exception as exc:
            logger.error("analyze-provider-risk error: %s", exc)
            return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(result)
