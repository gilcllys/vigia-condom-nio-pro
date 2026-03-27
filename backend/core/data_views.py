"""Data CRUD views — replaces direct Supabase queries from the frontend."""

import logging
from datetime import datetime, timezone

from django.db import connection
from django.db.models import Count, Q, Sum
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from condos.models import (
    ServiceOrder,
    ServiceOrderActivity,
    ServiceOrderPhoto,
    Ticket,
)
from core.models import (
    ActivityLog,
    Condo,
    CondoFinancialConfig,
    Resident,
    User,
    UserCondo,
    UserSession,
)
from invoices.models import FiscalDocument, FiscalDocumentApproval
from providers.models import Contract, Provider
from services import supabase_auth

logger = logging.getLogger(__name__)


def _get_internal_user(request):
    """Return the internal nfe_vigia.users row for the authenticated user."""
    auth_user_id = getattr(request.user, "auth_user_id", None)
    if not auth_user_id:
        return None
    try:
        return User.objects.get(auth_user_id=auth_user_id)
    except User.DoesNotExist:
        return None


def _get_condo_id(request):
    return (
        request.query_params.get("condo_id")
        or request.data.get("condo_id")
    )


# ── Users ────────────────────────────────────────────────────────────────────


class UserMeView(APIView):
    """GET/PATCH /api/data/users/me/"""

    def get(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "id": str(db_user.id),
            "auth_user_id": str(db_user.auth_user_id),
            "full_name": db_user.full_name,
            "email": db_user.email,
            "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
        })

    def patch(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        allowed = ["full_name", "email", "cpf_rg", "birth_date", "profile", "status", "condo_id"]
        for field in allowed:
            if field in request.data:
                setattr(db_user, field, request.data[field])
        db_user.save()
        return Response({"success": True, "id": str(db_user.id)})


class UserByAuthIdView(APIView):
    """GET /api/data/users/by-auth-id/?auth_user_id=X"""

    def get(self, request):
        auth_id = request.query_params.get("auth_user_id")
        if not auth_id:
            return Response({"error": "auth_user_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            u = User.objects.get(auth_user_id=auth_id)
            return Response({
                "id": str(u.id),
                "auth_user_id": str(u.auth_user_id),
                "full_name": u.full_name,
                "email": u.email,
                "condo_id": str(u.condo_id) if hasattr(u, "condo_id") and u.condo_id else None,
                "status": getattr(u, "status", None),
                "user_profile": getattr(u, "profile", None),
            })
        except User.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)


# ── User Sessions ────────────────────────────────────────────────────────────


class UserSessionsView(APIView):
    """GET/POST/DELETE /api/data/user-sessions/"""

    def get(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response([])
        now = datetime.now(timezone.utc).isoformat()
        sessions = UserSession.objects.filter(
            user=db_user,
            expires_at__gt=now,
        ).values("id", "session_token", "created_at")
        return Response(list(sessions))

    def post(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)
        session = UserSession.objects.create(
            user=db_user,
            session_token=request.data.get("session_token", ""),
            expires_at=request.data.get("expires_at"),
        )
        return Response({"id": str(session.id)}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        token = request.data.get("session_token") or request.query_params.get("session_token")
        if token:
            UserSession.objects.filter(session_token=token).delete()
        return Response({"success": True})


# ── Condos ───────────────────────────────────────────────────────────────────


class MyCondosView(APIView):
    """GET /api/data/condos/my/ — equivalent of get_my_condos RPC"""

    def get(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response([])

        uc_rows = UserCondo.objects.filter(user=db_user, status="ativo").select_related("condo")
        result = []
        for uc in uc_rows:
            result.append({
                "condo_id": str(uc.condo_id),
                "condo_name": uc.condo.name if uc.condo else None,
                "role": uc.role,
                "is_default": getattr(uc, "is_default", False),
            })
        return Response(result)


class ActiveCondoContextView(APIView):
    """GET /api/data/condos/active-context/ — equivalent of get_active_condo_context RPC"""

    def get(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response(None)

        # Find default condo, or first active one
        uc = (
            UserCondo.objects
            .filter(user=db_user, status="ativo")
            .select_related("condo")
            .order_by("-is_default", "-created_at")
            .first()
        )

        if not uc:
            return Response(None)

        return Response({
            "condo_id": str(uc.condo_id),
            "condo_name": uc.condo.name if uc.condo else None,
            "role": uc.role,
        })


class SwitchCondoView(APIView):
    """POST /api/data/condos/switch/ — equivalent of switch_active_condo RPC"""

    def post(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        target_condo_id = request.data.get("condo_id")
        if not target_condo_id:
            return Response({"error": "condo_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        # Reset all defaults for this user
        UserCondo.objects.filter(user=db_user).update(is_default=False)
        # Set the target as default
        updated = UserCondo.objects.filter(
            user=db_user, condo_id=target_condo_id, status="ativo"
        ).update(is_default=True)

        if not updated:
            return Response({"error": "Condo não encontrado ou sem acesso"}, status=status.HTTP_404_NOT_FOUND)

        uc = UserCondo.objects.filter(
            user=db_user, condo_id=target_condo_id
        ).select_related("condo").first()

        return Response({
            "condo_id": str(uc.condo_id),
            "condo_name": uc.condo.name if uc.condo else None,
            "role": uc.role,
        })


class CreateCondoView(APIView):
    """POST /api/data/condos/create/ — equivalent of onboard_create_condo RPC"""

    def post(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get("name", "").strip()
        document = request.data.get("document", "").strip() or None

        if not name:
            return Response({"error": "Nome é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        # Call the DB function directly
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT nfe_vigia.onboard_create_condo(%s, %s)",
                [name, document],
            )
            result = cursor.fetchone()

        condo_id = result[0] if result else None

        if not condo_id:
            # Fallback: create manually
            condo = Condo.objects.create(name=name)
            condo_id = condo.id
            UserCondo.objects.create(
                user=db_user, condo=condo, role="ADMIN", status="ativo", is_default=True
            )
        else:
            # Make sure user_condos link exists
            if not UserCondo.objects.filter(user=db_user, condo_id=condo_id).exists():
                UserCondo.objects.create(
                    user=db_user, condo_id=condo_id, role="ADMIN", status="ativo", is_default=True
                )

        return Response({"success": True, "condo_id": str(condo_id)}, status=status.HTTP_201_CREATED)


class CondoUpdateView(APIView):
    """PATCH /api/data/condos/<uuid:condo_id>/"""

    def patch(self, request, condo_id):
        allowed = ["name"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        if not updates:
            return Response({"error": "Nenhum campo para atualizar"}, status=status.HTTP_400_BAD_REQUEST)
        Condo.objects.filter(id=condo_id).update(**updates)
        return Response({"success": True})


class CondoBillingView(APIView):
    """GET /api/data/condos/<uuid:condo_id>/billing/"""

    def get(self, request, condo_id):
        try:
            c = Condo.objects.get(id=condo_id)
            return Response({
                "name": c.name,
                "subscription_status": c.subscription_status,
                "subscription_id": c.subscription_id,
                "subscription_expires_at": c.subscription_expires_at.isoformat() if c.subscription_expires_at else None,
            })
        except Condo.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)


# ── Condo Financial Config ───────────────────────────────────────────────────


class FinancialConfigView(APIView):
    """GET/PUT /api/data/condos/<uuid:condo_id>/financial-config/"""

    def get(self, request, condo_id):
        try:
            cfg = CondoFinancialConfig.objects.get(condo_id=condo_id)
            return Response({
                "id": str(cfg.id),
                "condo_id": str(cfg.condo_id),
                "annual_budget": float(cfg.annual_budget) if cfg.annual_budget else None,
                "approval_deadline_hours": cfg.approval_deadline_hours,
                "notify_residents_above": float(cfg.notify_residents_above) if cfg.notify_residents_above else None,
                "alcada_1_limite": getattr(cfg, "alcada_1_limite", None),
                "alcada_2_limite": getattr(cfg, "alcada_2_limite", None),
                "alcada_3_limite": getattr(cfg, "alcada_3_limite", None),
                "monthly_limit_manutencao": getattr(cfg, "monthly_limit_manutencao", None),
                "monthly_limit_limpeza": getattr(cfg, "monthly_limit_limpeza", None),
                "monthly_limit_seguranca": getattr(cfg, "monthly_limit_seguranca", None),
                "annual_budget_alert_pct": getattr(cfg, "annual_budget_alert_pct", None),
            })
        except CondoFinancialConfig.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)

    def put(self, request, condo_id):
        cfg, _ = CondoFinancialConfig.objects.get_or_create(condo_id=condo_id)
        allowed = [
            "annual_budget", "approval_deadline_hours", "notify_residents_above",
            "alcada_1_limite", "alcada_2_limite", "alcada_3_limite",
            "monthly_limit_manutencao", "monthly_limit_limpeza", "monthly_limit_seguranca",
            "annual_budget_alert_pct",
        ]
        for field in allowed:
            if field in request.data:
                setattr(cfg, field, request.data[field])
        cfg.save()
        return Response({"success": True})


# ── Residents ────────────────────────────────────────────────────────────────


class ResidentsView(APIView):
    """GET/POST /api/data/residents/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        # Use the RPC for resident + user matching
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM nfe_vigia.list_residents_with_user_match(%s)",
                [condo_id],
            )
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

        # Convert UUID fields to strings
        for row in rows:
            for key, val in row.items():
                if hasattr(val, "hex"):
                    row[key] = str(val)

        return Response(rows)

    def post(self, request):
        data = request.data
        condo_id = data.get("condo_id")
        if not condo_id:
            return Response({"error": "condo_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        resident = Resident.objects.create(
            condo_id=condo_id,
            full_name=data.get("full_name", "").strip(),
            document=data.get("document") or None,
            email=data.get("email") or None,
            phone=data.get("phone") or None,
            block=data.get("block") or None,
            unit=data.get("unit") or None,
            unit_label=data.get("unit_label") or None,
            unit_id=data.get("unit_id") or None,
        )
        return Response({"id": str(resident.id)}, status=status.HTTP_201_CREATED)


class ResidentDetailView(APIView):
    """PATCH/DELETE /api/data/residents/<uuid:resident_id>/"""

    def patch(self, request, resident_id):
        allowed = ["full_name", "document", "email", "phone", "block", "unit", "unit_label", "unit_id", "condo_id"]
        updates = {k: (v if v else None) for k, v in request.data.items() if k in allowed}
        Resident.objects.filter(id=resident_id).update(**updates)
        return Response({"success": True})

    def delete(self, request, resident_id):
        Resident.objects.filter(id=resident_id).delete()
        return Response({"success": True})


# ── User Condos ──────────────────────────────────────────────────────────────


class UserCondosView(APIView):
    """GET/POST /api/data/user-condos/"""

    def get(self, request):
        db_user = _get_internal_user(request)
        user_id = request.query_params.get("user_id") or (str(db_user.id) if db_user else None)
        condo_id = request.query_params.get("condo_id")

        qs = UserCondo.objects.all()
        if user_id:
            qs = qs.filter(user_id=user_id)
        if condo_id:
            qs = qs.filter(condo_id=condo_id)

        result = list(qs.values("id", "user_id", "condo_id", "role", "status", "is_default", "created_at"))
        for r in result:
            r["id"] = str(r["id"])
            r["user_id"] = str(r["user_id"])
            r["condo_id"] = str(r["condo_id"])
        return Response(result)

    def post(self, request):
        uc = UserCondo.objects.create(
            user_id=request.data["user_id"],
            condo_id=request.data["condo_id"],
            role=request.data.get("role", "MORADOR"),
            status=request.data.get("status", "pendente"),
            is_default=request.data.get("is_default", False),
        )
        return Response({"id": str(uc.id)}, status=status.HTTP_201_CREATED)


class UserCondoDetailView(APIView):
    """PATCH /api/data/user-condos/<uuid:uc_id>/"""

    def patch(self, request, uc_id):
        allowed = ["role", "status", "is_default"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        UserCondo.objects.filter(id=uc_id).update(**updates)
        return Response({"success": True})


# ── Condos Invite Validation (public for signup) ────────────────────────────


class ValidateInviteView(APIView):
    """GET /api/data/condos/validate-invite/?code=X"""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get("code", "")
        if not code:
            return Response(None)
        try:
            c = Condo.objects.get(invite_code=code, invite_active=True)
            return Response({"id": str(c.id), "name": c.name})
        except Condo.DoesNotExist:
            return Response(None)


# ── Fiscal Documents ─────────────────────────────────────────────────────────


class FiscalDocumentsView(APIView):
    """GET/POST /api/data/fiscal-documents/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = FiscalDocument.objects.filter(condo_id=condo_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Count mode
        if request.query_params.get("count_only") == "true":
            return Response({"count": qs.count()})

        # Sum mode
        if request.query_params.get("sum_amount") == "true":
            gte = request.query_params.get("created_at__gte")
            if gte:
                qs = qs.filter(created_at__gte=gte)
            total = qs.aggregate(total=Sum("amount"))["total"] or 0
            return Response({"total": float(total)})

        result = list(qs.order_by("-created_at").values())
        for r in result:
            for k in ["id", "condo_id", "service_order_id"]:
                if r.get(k):
                    r[k] = str(r[k])
            if r.get("amount"):
                r["amount"] = float(r["amount"])
            if r.get("gross_amount"):
                r["gross_amount"] = float(r["gross_amount"])
        return Response(result)

    def post(self, request):
        data = request.data
        doc = FiscalDocument.objects.create(
            condo_id=data["condo_id"],
            number=data.get("number"),
            amount=data.get("amount", 0),
            gross_amount=data.get("gross_amount"),
            issue_date=data.get("issue_date"),
            issuer_name=data.get("issuer_name"),
            supplier=data.get("supplier"),
            file_url=data.get("file_url"),
            source_type=data.get("source_type"),
            document_type=data.get("document_type"),
            status=data.get("status", "pendente"),
            service_order_id=data.get("service_order_id"),
        )
        return Response({"id": str(doc.id)}, status=status.HTTP_201_CREATED)


class FiscalDocumentDetailView(APIView):
    """GET /api/data/fiscal-documents/<uuid:doc_id>/"""

    def get(self, request, doc_id):
        try:
            doc = FiscalDocument.objects.get(id=doc_id)
            return Response({
                "id": str(doc.id),
                "condo_id": str(doc.condo_id),
                "number": doc.number,
                "amount": float(doc.amount) if doc.amount else None,
                "supplier": doc.supplier,
                "issue_date": str(doc.issue_date) if doc.issue_date else None,
                "document_type": doc.document_type,
                "file_url": doc.file_url,
                "created_at": doc.created_at.isoformat(),
                "status": doc.status,
                "service_order_id": str(doc.service_order_id) if doc.service_order_id else None,
            })
        except FiscalDocument.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)


# ── Approvals ────────────────────────────────────────────────────────────────


class ApprovalsView(APIView):
    """GET/POST/PATCH /api/data/approvals/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        approver_user_id = request.query_params.get("approver_user_id")
        fiscal_document_id = request.query_params.get("fiscal_document_id")

        # Count mode
        if request.query_params.get("count_only") == "true":
            qs = FiscalDocumentApproval.objects.filter(condo_id=condo_id)
            decision = request.query_params.get("decision")
            if decision:
                qs = qs.filter(decision=decision)
            return Response({"count": qs.count()})

        qs = FiscalDocumentApproval.objects.all()
        if condo_id:
            qs = qs.filter(condo_id=condo_id)
        if approver_user_id:
            qs = qs.filter(approver_user_id=approver_user_id)
        if fiscal_document_id:
            qs = qs.filter(fiscal_document_id=fiscal_document_id)

        qs = qs.select_related("fiscal_document").order_by("voted_at")

        result = []
        for a in qs:
            row = {
                "id": str(a.id),
                "decision": a.decision,
                "fiscal_document_id": str(a.fiscal_document_id),
                "approver_user_id": str(a.approver_user_id),
                "approver_role": a.approver_role,
                "voted_at": a.voted_at.isoformat() if a.voted_at else None,
                "justification": a.justification,
            }
            if a.fiscal_document:
                fd = a.fiscal_document
                row["fiscal_documents"] = {
                    "id": str(fd.id),
                    "number": fd.number,
                    "amount": float(fd.amount) if fd.amount else None,
                    "supplier": fd.supplier,
                    "issue_date": str(fd.issue_date) if fd.issue_date else None,
                    "document_type": fd.document_type,
                    "status": fd.status,
                    "created_at": fd.created_at.isoformat(),
                    "file_url": fd.file_url,
                }
            result.append(row)
        return Response(result)

    def post(self, request):
        records = request.data if isinstance(request.data, list) else [request.data]
        created = []
        for rec in records:
            a = FiscalDocumentApproval.objects.create(
                fiscal_document_id=rec["fiscal_document_id"],
                condo_id=rec["condo_id"],
                approver_user_id=rec["approver_user_id"],
                approver_role=rec["approver_role"],
                decision=rec.get("decision", "pendente"),
                justification=rec.get("justification"),
                voted_at=rec.get("voted_at"),
            )
            created.append(str(a.id))
        return Response({"ids": created}, status=status.HTTP_201_CREATED)


class ApprovalDetailView(APIView):
    """PATCH /api/data/approvals/<uuid:approval_id>/"""

    def patch(self, request, approval_id):
        allowed = ["decision", "justification", "voted_at"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        FiscalDocumentApproval.objects.filter(id=approval_id).update(**updates)
        return Response({"success": True})


# ── Service Orders ───────────────────────────────────────────────────────────


class ServiceOrdersView(APIView):
    """GET/POST /api/data/service-orders/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = ServiceOrder.objects.filter(condo_id=condo_id)
        created_by = request.query_params.get("created_by")
        if created_by:
            qs = qs.filter(created_by=created_by)

        offset = int(request.query_params.get("offset", 0))
        limit = int(request.query_params.get("limit", 20))
        qs = qs.order_by("-created_at")[offset:offset + limit]

        orders = list(qs.values())
        ids = [o["id"] for o in orders]

        # Count photos per order
        photo_counts = dict(
            ServiceOrderPhoto.objects.filter(service_order_id__in=ids)
            .values("service_order_id")
            .annotate(cnt=Count("id"))
            .values_list("service_order_id", "cnt")
        )

        for o in orders:
            o["photo_count"] = photo_counts.get(o["id"], 0)
            for k in ["id", "condo_id", "created_by", "provider_id", "ticket_id"]:
                if o.get(k):
                    o[k] = str(o[k])

        return Response(orders)

    def post(self, request):
        data = request.data
        so = ServiceOrder.objects.create(
            condo_id=data["condo_id"],
            title=data["title"],
            description=data.get("description"),
            location=data.get("location"),
            priority=data.get("priority", "MEDIA"),
            executor_type=data.get("executor_type"),
            status=data.get("status", "ABERTA"),
            created_by=data.get("created_by"),
            is_emergency=data.get("is_emergency", False),
            provider_id=data.get("provider_id"),
            ticket_id=data.get("ticket_id"),
        )
        return Response({"id": str(so.id)}, status=status.HTTP_201_CREATED)


class ServiceOrderDetailView(APIView):
    """GET/PATCH /api/data/service-orders/<uuid:so_id>/"""

    def get(self, request, so_id):
        try:
            so = ServiceOrder.objects.get(id=so_id)
            return Response({
                "id": str(so.id),
                "condo_id": str(so.condo_id),
                "title": so.title,
                "description": so.description,
                "location": so.location,
                "status": so.status,
                "priority": so.priority,
                "is_emergency": so.is_emergency,
                "executor_type": so.executor_type,
                "provider_id": str(so.provider_id) if so.provider_id else None,
                "ticket_id": str(so.ticket_id) if so.ticket_id else None,
                "final_pdf_url": so.final_pdf_url,
                "created_by": str(so.created_by) if so.created_by else None,
                "created_at": so.created_at.isoformat(),
            })
        except ServiceOrder.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, so_id):
        allowed = ["title", "description", "location", "status", "priority",
                    "is_emergency", "executor_type", "provider_id", "ticket_id",
                    "final_pdf_url"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        ServiceOrder.objects.filter(id=so_id).update(**updates)
        return Response({"success": True})


# ── Service Order Photos ─────────────────────────────────────────────────────


class ServiceOrderPhotosView(APIView):
    """GET/POST /api/data/service-orders/<uuid:so_id>/photos/"""

    def get(self, request, so_id):
        photos = list(ServiceOrderPhoto.objects.filter(service_order_id=so_id).values())
        for p in photos:
            p["id"] = str(p["id"])
            p["service_order_id"] = str(p["service_order_id"])
        return Response(photos)

    def post(self, request, so_id):
        data = request.data
        photo = ServiceOrderPhoto.objects.create(
            service_order_id=so_id,
            photo_type=data.get("photo_type"),
            file_url=data["file_url"],
            observation=data.get("observation"),
        )
        return Response({"id": str(photo.id)}, status=status.HTTP_201_CREATED)


# ── Service Order Activities ─────────────────────────────────────────────────


class SOActivitiesView(APIView):
    """GET/POST /api/data/service-orders/<uuid:so_id>/activities/"""

    def get(self, request, so_id):
        acts = list(
            ServiceOrderActivity.objects.filter(service_order_id=so_id)
            .order_by("-created_at")
            .values()
        )
        for a in acts:
            for k in ["id", "service_order_id", "user_id"]:
                if a.get(k):
                    a[k] = str(a[k])
        return Response(acts)

    def post(self, request, so_id):
        data = request.data
        user_id = data.get("user_id")
        if not user_id:
            db_user = _get_internal_user(request)
            if db_user:
                user_id = str(db_user.id)

        act = ServiceOrderActivity.objects.create(
            service_order_id=so_id,
            user_id=user_id,
            activity_type=data.get("activity_type", ""),
            description=data.get("description"),
        )
        return Response({"id": str(act.id)}, status=status.HTTP_201_CREATED)


# ── Tickets ──────────────────────────────────────────────────────────────────


class TicketsView(APIView):
    """GET/POST /api/data/tickets/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = Ticket.objects.filter(condo_id=condo_id)
        status_in = request.query_params.get("status__in")
        if status_in:
            qs = qs.filter(status__in=status_in.split(","))

        qs = qs.order_by("-created_at")
        result = list(qs.values())
        for r in result:
            for k in ["id", "condo_id", "created_by", "service_order_id"]:
                if r.get(k):
                    r[k] = str(r[k])
        return Response(result)

    def post(self, request):
        data = request.data
        t = Ticket.objects.create(
            condo_id=data["condo_id"],
            title=data["title"],
            description=data.get("description"),
            location=data.get("location"),
            category=data.get("category"),
            unit=data.get("unit"),
            status=data.get("status", "aberto"),
            created_by=data.get("created_by"),
        )
        return Response({"id": str(t.id)}, status=status.HTTP_201_CREATED)


class TicketDetailView(APIView):
    """PATCH /api/data/tickets/<uuid:ticket_id>/"""

    def patch(self, request, ticket_id):
        allowed = ["title", "description", "status", "close_reason", "service_order_id", "location", "category"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        Ticket.objects.filter(id=ticket_id).update(**updates)
        return Response({"success": True})


# ── Providers ────────────────────────────────────────────────────────────────


class ProvidersListView(APIView):
    """GET /api/data/providers/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = Provider.objects.filter(condo_id=condo_id, deleted_at__isnull=True).order_by("trade_name")
        fields_param = request.query_params.get("fields")
        if fields_param:
            fields = [f.strip() for f in fields_param.split(",")]
            result = list(qs.values(*fields))
        else:
            result = list(qs.values())
        for r in result:
            for k in ["id", "condo_id"]:
                if r.get(k):
                    r[k] = str(r[k])
        return Response(result)


# ── Contracts ────────────────────────────────────────────────────────────────


class ContractsView(APIView):
    """GET/POST /api/data/contracts/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = Contract.objects.filter(condo_id=condo_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        contract_type = request.query_params.get("contract_type")
        if contract_type:
            qs = qs.filter(contract_type=contract_type)

        qs = qs.order_by("-created_at")
        result = list(qs.values())
        for r in result:
            for k in ["id", "condo_id", "provider_id", "created_by"]:
                if r.get(k):
                    r[k] = str(r[k])
            if r.get("value"):
                r["value"] = float(r["value"])
        return Response(result)

    def post(self, request):
        data = request.data
        c = Contract.objects.create(
            condo_id=data["condo_id"],
            title=data["title"],
            description=data.get("description"),
            contract_type=data.get("contract_type", "SERVICO"),
            value=data.get("value"),
            start_date=data.get("start_date") or None,
            end_date=data.get("end_date") or None,
            provider_id=data.get("provider_id") or None,
            status=data.get("status", "RASCUNHO"),
            created_by=data.get("created_by"),
        )
        return Response({"id": str(c.id)}, status=status.HTTP_201_CREATED)


class ContractDetailView(APIView):
    """PATCH/DELETE /api/data/contracts/<uuid:contract_id>/"""

    def patch(self, request, contract_id):
        allowed = ["title", "description", "contract_type", "value", "start_date",
                    "end_date", "provider_id", "status"]
        updates = {}
        for k, v in request.data.items():
            if k in allowed:
                updates[k] = v if v != "" else None
        Contract.objects.filter(id=contract_id).update(**updates)
        return Response({"success": True})

    def delete(self, request, contract_id):
        Contract.objects.filter(id=contract_id).delete()
        return Response({"success": True})


# ── Activity Logs ────────────────────────────────────────────────────────────


class ActivityLogsView(APIView):
    """GET/POST /api/data/activity-logs/"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        limit = int(request.query_params.get("limit", 20))
        logs = list(
            ActivityLog.objects.filter(condo_id=condo_id)
            .order_by("-created_at")[:limit]
            .values()
        )
        for l in logs:
            for k in ["id", "condo_id", "user_id", "entity_id"]:
                if l.get(k):
                    l[k] = str(l[k])
        return Response(logs)

    def post(self, request):
        data = request.data
        db_user = _get_internal_user(request)
        log = ActivityLog.objects.create(
            condo_id=data["condo_id"],
            user_id=db_user.id if db_user else data.get("user_id"),
            action=data.get("action", ""),
            entity=data.get("entity"),
            entity_id=data.get("entity_id"),
            description=data.get("description"),
        )
        return Response({"id": str(log.id)}, status=status.HTTP_201_CREATED)


# ── Storage Proxy ────────────────────────────────────────────────────────────


class StorageUploadView(APIView):
    """POST /api/data/storage/upload/ — proxy file upload to Supabase Storage"""
    parser_classes = [MultiPartParser]

    def post(self, request):
        bucket = request.data.get("bucket")
        path = request.data.get("path")
        file = request.FILES.get("file")

        if not all([bucket, path, file]):
            return Response(
                {"error": "bucket, path e file são obrigatórios"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = supabase_auth.storage_upload(bucket, path, file.read(), file.content_type)
        return Response(result["data"], status=result["status"])


class StorageSignedUrlView(APIView):
    """GET /api/data/storage/signed-url/?bucket=X&path=Y"""

    def get(self, request):
        bucket = request.query_params.get("bucket", "")
        path = request.query_params.get("path", "")
        if not bucket or not path:
            return Response({"error": "bucket e path são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        result = supabase_auth.storage_create_signed_url(bucket, path)
        return Response(result["data"], status=result["status"])


# ── Dashboard Stats ──────────────────────────────────────────────────────────


class DashboardStatsView(APIView):
    """GET /api/data/dashboard/stats/?condo_id=X"""

    def get(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response({})

        now = datetime.now(timezone.utc)
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        nfs_pending = FiscalDocument.objects.filter(
            condo_id=condo_id, status="PENDENTE"
        ).count()

        approvals_pending = FiscalDocumentApproval.objects.filter(
            condo_id=condo_id, decision="PENDENTE"
        ).count()

        try:
            cfg = CondoFinancialConfig.objects.get(condo_id=condo_id)
            budget_total = float(cfg.annual_budget) if cfg.annual_budget else 0
        except CondoFinancialConfig.DoesNotExist:
            budget_total = 0

        budget_used = float(
            FiscalDocument.objects.filter(
                condo_id=condo_id, status="APROVADO", created_at__gte=start_of_month
            ).aggregate(total=Sum("amount"))["total"] or 0
        )

        return Response({
            "nfsPendentes": nfs_pending,
            "aprovacoesPendentes": approvals_pending,
            "budgetTotal": budget_total,
            "budgetUsed": budget_used,
        })
