import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Condo
from core.permissions import IsCondoAdmin
from services import pagarme_service
from services.pagarme_service import PagarmeError

from .serializers import CreateSubscriptionSerializer

logger = logging.getLogger(__name__)

# ─── Event → internal status mapping (same as Deno function) ─────────────────

EVENT_STATUS_MAP = {
    "subscription.created": "active",
    "subscription.updated": None,
    "subscription.canceled": "canceled",
    "subscription.ended": "canceled",
    "charge.paid": "active",
    "charge.payment_failed": "past_due",
    "charge.refunded": None,
    "invoice.paid": "active",
    "invoice.payment_failed": "past_due",
    "invoice.canceled": "canceled",
}


class CreateSubscriptionView(APIView):
    """POST /api/subscriptions/create/ — replaces create-subscription edge function."""

    permission_classes = [IsCondoAdmin]

    def post(self, request):
        serializer = CreateSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        condo_id = str(data["condo_id"])
        card_token = data["card_token"]
        customer_data = data["customer"]

        try:
            condo = Condo.objects.get(id=condo_id)
        except Condo.DoesNotExist:
            return Response({"error": "Condomínio não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if condo.subscription_id:
            return Response(
                {"error": "Este condomínio já possui uma assinatura ativa. Para trocar o cartão, cancele primeiro."},
                status=status.HTTP_409_CONFLICT,
            )

        # Create / reuse Pagar.me customer
        customer_id = condo.pagarme_customer_id
        if not customer_id:
            try:
                cust_data = pagarme_service.create_customer(customer_data)
            except PagarmeError as exc:
                return Response(
                    {"error": str(exc), "detail": exc.detail},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            customer_id = cust_data["id"]
            Condo.objects.filter(id=condo_id).update(pagarme_customer_id=customer_id)

        # Create subscription
        try:
            sub_data = pagarme_service.create_subscription(
                customer_id=customer_id,
                card_token=card_token,
                condo_id=condo_id,
                condo_name=condo.name or "",
            )
        except PagarmeError as exc:
            return Response(
                {"error": str(exc), "detail": exc.detail},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        pagarme_status = sub_data.get("status", "pending")
        internal_status = pagarme_service.map_pagarme_status(pagarme_status)

        now = datetime.now(timezone.utc)
        expires_at = (
            sub_data.get("next_billing_at")
            or (sub_data.get("current_period") or {}).get("end_at")
            or datetime(now.year, now.month + (1 if now.month < 12 else 1), now.day, tzinfo=timezone.utc).isoformat()
        )

        updated = Condo.objects.filter(id=condo_id).update(
            subscription_id=sub_data["id"],
            subscription_status=internal_status,
            subscription_expires_at=expires_at,
            pagarme_customer_id=customer_id,
        )

        if not updated:
            logger.error("Failed to update condo %s after subscription creation", condo_id)
            return Response(
                {"warning": "Assinatura criada mas houve erro ao salvar no banco. Contate o suporte.",
                 "subscription_id": sub_data["id"]},
                status=207,
            )

        return Response({
            "success": True,
            "subscription_id": sub_data["id"],
            "status": internal_status,
            "next_billing_at": expires_at,
        })


class PagarmeWebhookView(APIView):
    """POST /api/subscriptions/webhook/ — replaces pagarme-webhook edge function."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ok": True, "message": "pagarme-webhook is live"})

    def post(self, request):
        raw_body = request.body.decode("utf-8")
        webhook_secret = settings.PAGARME_WEBHOOK_SECRET

        # Validate HMAC signature
        if webhook_secret:
            sig_header = (
                request.META.get("HTTP_X_HUB_SIGNATURE")
                or request.META.get("HTTP_X_PAGARME_SIGNATURE")
                or ""
            )
            if not self._verify_signature(webhook_secret, raw_body, sig_header):
                logger.warning("pagarme-webhook: Invalid signature — rejecting")
                return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)
        else:
            logger.warning("pagarme-webhook: PAGARME_WEBHOOK_SECRET not set — skipping signature check")

        try:
            event = json.loads(raw_body)
        except json.JSONDecodeError:
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        event_type = event.get("type", "")
        event_data = event.get("data", {})

        logger.info("pagarme-webhook: Received event: %s", event_type)

        # Determine subscription ID and target status
        subscription_id = None
        target_status = EVENT_STATUS_MAP.get(event_type)

        if isinstance(event_data.get("id"), str) and event_data["id"].startswith("sub_"):
            subscription_id = event_data["id"]
            if event_type == "subscription.updated" and event_data.get("status"):
                target_status = pagarme_service.map_pagarme_status(event_data["status"])

        if not subscription_id:
            subscription_id = event_data.get("subscription_id")
        if not subscription_id:
            subscription_id = (event_data.get("invoice") or {}).get("subscription_id")

        if not subscription_id or not target_status:
            logger.info("pagarme-webhook: Ignored event %s", event_type)
            return Response({"received": True, "action": "ignored"})

        # Build update payload
        update_fields = {"subscription_status": target_status}

        new_expires_at = (
            event_data.get("next_billing_at")
            or (event_data.get("current_period") or {}).get("end_at")
            or (event_data.get("invoice") or {}).get("due_at")
        )
        if new_expires_at:
            update_fields["subscription_expires_at"] = new_expires_at

        updated = Condo.objects.filter(subscription_id=subscription_id).update(**update_fields)

        logger.info(
            "pagarme-webhook: Updated sub %s → status=%s (%d rows)",
            subscription_id, target_status, updated,
        )

        return Response({"received": True, "subscription_id": subscription_id, "status": target_status})

    @staticmethod
    def _verify_signature(secret: str, raw_body: str, signature_header: str) -> bool:
        if not signature_header or not secret:
            return False

        # Pagar.me V5: "t=<timestamp>,v1=<hex_hmac>"
        parts = {}
        for part in signature_header.split(","):
            if "=" in part:
                key, _, value = part.partition("=")
                parts[key] = value

        timestamp = parts.get("t")
        received_hex = parts.get("v1")
        if not timestamp or not received_hex:
            return False

        payload = f"{timestamp}.{raw_body}"
        computed = hmac.new(
            secret.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed, received_hex)
