import logging
from locale import LC_ALL, setlocale

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import User
from services import resend_service, supabase_admin

from .serializers import SendApprovalEmailSerializer

logger = logging.getLogger(__name__)


def _format_currency(amount: float) -> str:
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _build_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="color:#6b7280;padding:5px 0;vertical-align:top;white-space:nowrap;padding-right:16px">{label}</td>'
        f'<td style="color:#111827;font-weight:600;padding:5px 0">{value}</td>'
        f'</tr>'
    )


def _build_html(heading: str, intro: str, rows: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#6366f1;padding:24px 32px">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">NFe Vigia</h1>
            <p style="margin:4px 0 0;color:#e0e7ff;font-size:12px">Gestão inteligente de condomínios</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 10px;font-size:17px;color:#111827;font-weight:700">{heading}</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.65">{intro}</p>
            <table cellpadding="0" cellspacing="0"
              style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;font-size:14px">
              {rows}
            </table>
            <div style="margin-top:28px;text-align:center">
              <a href="https://www.nfevigia.com.br/aprovacoes"
                 style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
                        padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;
                        letter-spacing:0.1px">
                Ver e Aprovar →
              </a>
            </div>
            <p style="margin-top:28px;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6">
              Você recebe este e-mail por ser aprovador neste condomínio.<br/>
              Dúvidas? Entre em contato com o síndico.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_email_content(email_type: str, ctx: dict) -> dict:
    amount_row = _build_row("Valor:", _format_currency(ctx["amount"])) if ctx.get("amount") is not None else ""

    templates = {
        "NF": {
            "subject": f"[NFe Vigia] Nova NF aguarda sua aprovação — {ctx['condo_name']}",
            "heading": "Nova Nota Fiscal aguarda sua aprovação",
            "intro": f"Uma nota fiscal de <strong>{ctx['condo_name']}</strong> foi registrada e aguarda a sua decisão.",
            "rows": _build_row("Documento:", ctx["title"]) + amount_row,
        },
        "OS_ORCAMENTO": {
            "subject": f"[NFe Vigia] Orçamentos de OS aguardam aprovação — {ctx['condo_name']}",
            "heading": "Orçamentos de Ordem de Serviço aguardam aprovação",
            "intro": f"Os orçamentos da OS abaixo foram enviados para aprovação em <strong>{ctx['condo_name']}</strong>. Analise os orçamentos e registre sua decisão.",
            "rows": _build_row("Ordem de Serviço:", ctx["title"]),
        },
        "OS_FINAL": {
            "subject": f"[NFe Vigia] Aprovação final de OS solicitada — {ctx['condo_name']}",
            "heading": "Aprovação final de Ordem de Serviço",
            "intro": f"A ordem de serviço abaixo foi concluída e aguarda aprovação final em <strong>{ctx['condo_name']}</strong>. Verifique a execução e registre sua decisão.",
            "rows": _build_row("Ordem de Serviço:", ctx["title"]),
        },
        "CONTRATO": {
            "subject": f"[NFe Vigia] Contrato aguarda sua aprovação — {ctx['condo_name']}",
            "heading": "Contrato aguarda sua aprovação",
            "intro": f"Um contrato de <strong>{ctx['condo_name']}</strong> foi enviado para aprovação. Analise o documento e registre sua decisão.",
            "rows": _build_row("Contrato:", ctx["title"]) + amount_row,
        },
    }

    t = templates[email_type]
    return {
        "subject": t["subject"],
        "html": _build_html(t["heading"], t["intro"], t["rows"]),
    }


class SendApprovalEmailView(APIView):
    """POST /api/notifications/approval-email/ — replaces send-approval-email edge function."""

    # This endpoint uses service-role key validation instead of JWT
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        # Validate service-role key from Authorization header
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        expected = f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"
        if not settings.SUPABASE_SERVICE_ROLE_KEY or auth_header != expected:
            return Response({"error": "Não autorizado"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = SendApprovalEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_type = data["type"]
        approver_user_ids = [str(uid) for uid in data["approver_user_ids"]]
        ctx = data["context"]

        logger.info(
            "send-approval-email: type=%s approvers=%d condo=%s",
            email_type, len(approver_user_ids), ctx["condo_name"],
        )

        # Step 1: Resolve auth_user_ids from users table
        user_rows = User.objects.filter(id__in=approver_user_ids).values_list("auth_user_id", flat=True)
        if not user_rows:
            return Response({"sent": 0, "message": "Nenhum usuário encontrado para os IDs fornecidos"})

        # Step 2: Resolve emails via Supabase Admin API
        emails = []
        for auth_user_id in user_rows:
            if not auth_user_id:
                continue
            email = supabase_admin.get_user_email(str(auth_user_id))
            if email:
                emails.append(email)

        if not emails:
            return Response({"sent": 0, "message": "Nenhum e-mail encontrado para os aprovadores"})

        # Step 3: Build email content
        content = _build_email_content(email_type, ctx)

        # Step 4: Send individually
        sent = 0
        for email in emails:
            if resend_service.send_email(email, content["subject"], content["html"]):
                sent += 1

        logger.info("send-approval-email: Done — sent=%d/%d", sent, len(emails))

        return Response({"sent": sent, "total": len(emails)})
