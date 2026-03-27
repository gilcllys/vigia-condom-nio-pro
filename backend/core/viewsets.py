"""ViewSets — DRF ModelViewSets that replace direct Supabase queries from the frontend."""

import logging
import os
import uuid
from datetime import datetime, timezone

from django.conf import settings
from django.db import connection
from django.db.models import Count, Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from condos.models import (
    Approval,
    Budget,
    ServiceOrder,
    ServiceOrderActivity,
    ServiceOrderMaterial,
    ServiceOrderPhoto,
    Ticket,
)
from condos.serializers import (
    ApprovalSerializer,
    BudgetSerializer,
    ServiceOrderActivitySerializer,
    ServiceOrderMaterialSerializer,
    ServiceOrderPhotoSerializer,
    ServiceOrderSerializer,
    TicketSerializer,
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
from core.serializers import (
    ActivityLogSerializer,
    ChangeRoleSerializer,
    CondoFinancialConfigSerializer,
    CondoSerializer,
    ResidentSerializer,
    SignupRegisterSerializer,
    UserCondoSerializer,
    UserSerializer,
    UserSessionSerializer,
)
from invoices.models import (
    FiscalDocument,
    FiscalDocumentApproval,
    FiscalDocumentItem,
    StockCategory,
    StockItem,
    StockMovement,
)
from invoices.serializers import (
    FiscalDocumentApprovalSerializer,
    FiscalDocumentItemSerializer,
    FiscalDocumentSerializer,
    StockCategorySerializer,
    StockItemSerializer,
    StockMovementSerializer,
)
from providers.models import Contract, Provider
from providers.serializers import ContractSerializer, ProviderSerializer
from services import supabase_auth

logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────────────


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
    return request.query_params.get("condo_id") or request.data.get("condo_id")


# ── Users ───────────────────────────────────────────────────────────────────


class UserViewSet(viewsets.GenericViewSet):
    """
    /api/data/users/me/          GET, PATCH
    /api/data/users/by-auth-id/  GET
    /api/data/users/?ids=...     GET (list by comma-separated IDs)
    """
    serializer_class = UserSerializer

    def list(self, request):
        ids = request.query_params.get("ids")
        if not ids:
            return Response([])
        id_list = [i.strip() for i in ids.split(",") if i.strip()]
        users = User.objects.filter(id__in=id_list)
        serializer = self.get_serializer(users, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get", "patch"], url_path="me")
    def me(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        if request.method == "PATCH":
            allowed = ["full_name", "email", "cpf_rg", "birth_date", "profile", "status", "condo_id"]
            for field in allowed:
                if field in request.data:
                    setattr(db_user, field, request.data[field])
            db_user.save()
            return Response({"success": True, "id": str(db_user.id)})

        serializer = self.get_serializer(db_user)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="by-auth-id")
    def by_auth_id(self, request):
        auth_id = request.query_params.get("auth_user_id")
        if not auth_id:
            return Response({"error": "auth_user_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            u = User.objects.get(auth_user_id=auth_id)
            serializer = self.get_serializer(u)
            return Response(serializer.data)
        except User.DoesNotExist:
            return Response(None, status=status.HTTP_200_OK)


# ── User Sessions ───────────────────────────────────────────────────────────


class UserSessionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        db_user = _get_internal_user(self.request)
        if not db_user:
            return UserSession.objects.none()
        now = datetime.now(timezone.utc).isoformat()
        return UserSession.objects.filter(user=db_user, expires_at__gt=now)

    def perform_create(self, serializer):
        db_user = _get_internal_user(self.request)
        serializer.save(user=db_user)

    def destroy(self, request, *args, **kwargs):
        token = request.data.get("session_token") or request.query_params.get("session_token")
        if token:
            UserSession.objects.filter(session_token=token).delete()
        return Response({"success": True})


# ── Condos ──────────────────────────────────────────────────────────────────


class CondoViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = CondoSerializer
    queryset = Condo.objects.all()

    @action(detail=False, methods=["get"], url_path="my")
    def my_condos(self, request):
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

    @action(detail=False, methods=["get"], url_path="active-context")
    def active_context(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response(None)

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

    @action(detail=False, methods=["post"], url_path="switch")
    def switch(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        target_condo_id = request.data.get("condo_id")
        if not target_condo_id:
            return Response({"error": "condo_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        UserCondo.objects.filter(user=db_user).update(is_default=False)
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

    @action(detail=False, methods=["post"], url_path="create")
    def create_condo(self, request):
        db_user = _get_internal_user(request)
        if not db_user:
            return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get("name", "").strip()
        document = request.data.get("document", "").strip() or None

        if not name:
            return Response({"error": "Nome é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT nfe_vigia.onboard_create_condo(%s, %s)",
                [name, document],
            )
            result = cursor.fetchone()

        condo_id = result[0] if result else None

        if not condo_id:
            condo = Condo.objects.create(name=name)
            condo_id = condo.id
            UserCondo.objects.create(
                user=db_user, condo=condo, role="ADMIN", status="ativo", is_default=True
            )
        else:
            if not UserCondo.objects.filter(user=db_user, condo_id=condo_id).exists():
                UserCondo.objects.create(
                    user=db_user, condo_id=condo_id, role="ADMIN", status="ativo", is_default=True
                )

        return Response({"success": True, "condo_id": str(condo_id)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="update")
    def update_condo(self, request, pk=None):
        allowed = ["name"]
        updates = {k: v for k, v in request.data.items() if k in allowed}
        if not updates:
            return Response({"error": "Nenhum campo para atualizar"}, status=status.HTTP_400_BAD_REQUEST)
        Condo.objects.filter(id=pk).update(**updates)
        return Response({"success": True})

    @action(detail=True, methods=["get"], url_path="billing")
    def billing(self, request, pk=None):
        try:
            c = Condo.objects.get(id=pk)
            return Response({
                "name": c.name,
                "subscription_status": c.subscription_status,
                "subscription_id": c.subscription_id,
                "subscription_expires_at": c.subscription_expires_at.isoformat() if c.subscription_expires_at else None,
            })
        except Condo.DoesNotExist:
            return Response(None, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["get", "put"], url_path="financial-config")
    def financial_config(self, request, pk=None):
        if request.method == "GET":
            try:
                cfg = CondoFinancialConfig.objects.get(condo_id=pk)
                serializer = CondoFinancialConfigSerializer(cfg)
                return Response(serializer.data)
            except CondoFinancialConfig.DoesNotExist:
                return Response(None, status=status.HTTP_200_OK)

        # PUT
        cfg, _ = CondoFinancialConfig.objects.get_or_create(condo_id=pk)
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

    @action(
        detail=False,
        methods=["get"],
        url_path="validate-invite",
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def validate_invite(self, request):
        code = request.query_params.get("code", "")
        if not code:
            return Response(None)
        try:
            c = Condo.objects.get(invite_code=code, invite_active=True)
            return Response({"id": str(c.id), "name": c.name})
        except Condo.DoesNotExist:
            return Response(None)


# ── Residents ───────────────────────────────────────────────────────────────


class ResidentViewSet(viewsets.ModelViewSet):
    serializer_class = ResidentSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return Resident.objects.none()
        qs = Resident.objects.filter(condo_id=condo_id)
        email = self.request.query_params.get("email")
        if email:
            qs = qs.filter(email__iexact=email)
        return qs

    def list(self, request, *args, **kwargs):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        # If email filter is provided, use simple queryset instead of RPC
        email = request.query_params.get("email")
        if email:
            qs = self.get_queryset()
            serializer = self.get_serializer(qs, many=True)
            return Response(serializer.data)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM nfe_vigia.list_residents_with_user_match(%s)",
                [condo_id],
            )
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

        for row in rows:
            for key, val in row.items():
                if hasattr(val, "hex"):
                    row[key] = str(val)

        return Response(rows)

    def perform_create(self, serializer):
        serializer.save()


# ── User Condos ─────────────────────────────────────────────────────────────


class UserCondoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = UserCondoSerializer

    def get_queryset(self):
        qs = UserCondo.objects.all()
        user_id = self.request.query_params.get("user_id")
        condo_id = self.request.query_params.get("condo_id")
        uc_status = self.request.query_params.get("status")
        role_in = self.request.query_params.get("role__in")
        if user_id:
            qs = qs.filter(user_id=user_id)
        if condo_id:
            qs = qs.filter(condo_id=condo_id)
        if uc_status:
            qs = qs.filter(status=uc_status)
        if role_in:
            qs = qs.filter(role__in=role_in.split(","))
        return qs

    @action(detail=False, methods=["post"], url_path="change-role")
    def change_role(self, request):
        serializer = ChangeRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uc_id = serializer.validated_data["user_condo_id"]
        new_role = serializer.validated_data["new_role"]

        try:
            uc = UserCondo.objects.get(id=uc_id)
        except UserCondo.DoesNotExist:
            return Response({"error": "user_condo não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        # Try using the DB function if it exists
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT nfe_vigia.change_user_condo_role_safe(%s, %s)",
                    [str(uc_id), new_role],
                )
        except Exception:
            # Fallback: simple update
            uc.role = new_role
            uc.save(update_fields=["role"])

        return Response({"success": True})


# ── Pending User Approvals ──────────────────────────────────────────────────


class PendingUserApprovalViewSet(viewsets.ViewSet):
    """GET /api/data/pending-user-approvals/?condo_id=X"""

    def list(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM nfe_vigia.list_pending_approvals(%s)",
                    [condo_id],
                )
                columns = [col[0] for col in cursor.description]
                rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

            for row in rows:
                for key, val in row.items():
                    if hasattr(val, "hex"):
                        row[key] = str(val)

            return Response(rows)
        except Exception as e:
            logger.error("Error listing pending approvals: %s", e)
            # Fallback: query UserCondo directly
            pending = UserCondo.objects.filter(
                condo_id=condo_id, status="pendente"
            ).select_related("user")
            result = []
            for uc in pending:
                result.append({
                    "user_condo_id": str(uc.id),
                    "user_id": str(uc.user_id),
                    "full_name": uc.user.full_name if uc.user else None,
                    "email": uc.user.email if uc.user else None,
                    "role": uc.role,
                    "status": uc.status,
                    "created_at": uc.created_at.isoformat(),
                })
            return Response(result)

    @action(detail=False, methods=["post"], url_path="approve")
    def approve(self, request):
        """POST /api/data/pending-user-approvals/approve/ with { user_id, condo_id }"""
        user_id = request.data.get("user_id")
        condo_id = request.data.get("condo_id")
        if not user_id or not condo_id:
            return Response({"error": "user_id e condo_id são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        # Update user status
        User.objects.filter(id=user_id).update(status="ativo")

        # Update user_condos status
        UserCondo.objects.filter(user_id=user_id, condo_id=condo_id).update(status="ativo")

        return Response({"success": True})

    @action(detail=False, methods=["post"], url_path="reject")
    def reject(self, request):
        """POST /api/data/pending-user-approvals/reject/ with { user_id, condo_id }"""
        user_id = request.data.get("user_id")
        condo_id = request.data.get("condo_id")
        if not user_id or not condo_id:
            return Response({"error": "user_id e condo_id são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        # Update user status
        User.objects.filter(id=user_id).update(status="recusado")

        # Update user_condos status
        UserCondo.objects.filter(user_id=user_id, condo_id=condo_id).update(status="recusado")

        return Response({"success": True})


# ── Fiscal Documents ────────────────────────────────────────────────────────


class FiscalDocumentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = FiscalDocumentSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return FiscalDocument.objects.none()

        qs = FiscalDocument.objects.filter(condo_id=condo_id)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by("-created_at")

    def list(self, request, *args, **kwargs):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = self.get_queryset()

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

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save()


# ── Fiscal Document Approvals ───────────────────────────────────────────────


class FiscalDocumentApprovalViewSet(viewsets.ModelViewSet):
    serializer_class = FiscalDocumentApprovalSerializer

    def get_queryset(self):
        qs = FiscalDocumentApproval.objects.all()
        condo_id = _get_condo_id(self.request)
        approver_user_id = self.request.query_params.get("approver_user_id")
        fiscal_document_id = self.request.query_params.get("fiscal_document_id")

        if condo_id:
            qs = qs.filter(condo_id=condo_id)
        if approver_user_id:
            qs = qs.filter(approver_user_id=approver_user_id)
        if fiscal_document_id:
            qs = qs.filter(fiscal_document_id=fiscal_document_id)

        return qs.select_related("fiscal_document").order_by("voted_at")

    def list(self, request, *args, **kwargs):
        condo_id = _get_condo_id(request)

        # Count mode
        if request.query_params.get("count_only") == "true":
            qs = FiscalDocumentApproval.objects.filter(condo_id=condo_id) if condo_id else FiscalDocumentApproval.objects.none()
            decision = request.query_params.get("decision")
            if decision:
                qs = qs.filter(decision=decision)
            return Response({"count": qs.count()})

        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
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


# ── Service Orders ──────────────────────────────────────────────────────────


class ServiceOrderViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceOrderSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return ServiceOrder.objects.none()

        qs = ServiceOrder.objects.filter(condo_id=condo_id)
        created_by = self.request.query_params.get("created_by")
        if created_by:
            qs = qs.filter(created_by=created_by)

        return qs.order_by("-created_at")

    def list(self, request, *args, **kwargs):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        qs = self.get_queryset()
        offset = int(request.query_params.get("offset", 0))
        limit = int(request.query_params.get("limit", 20))
        qs = qs[offset:offset + limit]

        orders = list(qs.values())
        ids = [o["id"] for o in orders]

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


# ── Service Order Photos ────────────────────────────────────────────────────


class ServiceOrderPhotoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ServiceOrderPhotoSerializer

    def get_queryset(self):
        so_id = self.kwargs.get("so_id")
        return ServiceOrderPhoto.objects.filter(service_order_id=so_id)

    def perform_create(self, serializer):
        so_id = self.kwargs.get("so_id")
        serializer.save(service_order_id=so_id)


# ── Service Order Activities ────────────────────────────────────────────────


class ServiceOrderActivityViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ServiceOrderActivitySerializer

    def get_queryset(self):
        so_id = self.kwargs.get("so_id")
        return ServiceOrderActivity.objects.filter(service_order_id=so_id).order_by("-created_at")

    def perform_create(self, serializer):
        so_id = self.kwargs.get("so_id")
        user_id = self.request.data.get("user_id")
        if not user_id:
            db_user = _get_internal_user(self.request)
            if db_user:
                user_id = str(db_user.id)
        serializer.save(service_order_id=so_id, user_id=user_id)


# ── Service Order Materials ─────────────────────────────────────────────────


class ServiceOrderMaterialViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceOrderMaterialSerializer

    def get_queryset(self):
        so_id = self.request.query_params.get("service_order_id")
        if so_id:
            return ServiceOrderMaterial.objects.filter(service_order_id=so_id)
        return ServiceOrderMaterial.objects.all()


# ── Tickets ─────────────────────────────────────────────────────────────────


class TicketViewSet(viewsets.ModelViewSet):
    serializer_class = TicketSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return Ticket.objects.none()

        qs = Ticket.objects.filter(condo_id=condo_id)
        status_in = self.request.query_params.get("status__in")
        if status_in:
            qs = qs.filter(status__in=status_in.split(","))

        created_by = self.request.query_params.get("created_by")
        if created_by:
            qs = qs.filter(created_by=created_by)

        return qs.order_by("-created_at")


# ── Providers ───────────────────────────────────────────────────────────────


class ProviderViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ProviderSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return Provider.objects.none()

        qs = Provider.objects.filter(condo_id=condo_id, deleted_at__isnull=True).order_by("trade_name")
        fields_param = self.request.query_params.get("fields")
        # Note: field filtering is handled in list override if needed
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        fields_param = request.query_params.get("fields")
        if fields_param:
            fields = [f.strip() for f in fields_param.split(",")]
            result = list(qs.values(*fields))
            for r in result:
                for k in ["id", "condo_id"]:
                    if r.get(k):
                        r[k] = str(r[k])
            return Response(result)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ── Contracts ───────────────────────────────────────────────────────────────


class ContractViewSet(viewsets.ModelViewSet):
    serializer_class = ContractSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return Contract.objects.none()

        qs = Contract.objects.filter(condo_id=condo_id)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        contract_type = self.request.query_params.get("contract_type")
        if contract_type:
            qs = qs.filter(contract_type=contract_type)

        return qs.order_by("-created_at")


# ── Activity Logs ───────────────────────────────────────────────────────────


class ActivityLogViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ActivityLogSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return ActivityLog.objects.none()

        limit = int(self.request.query_params.get("limit", 20))
        return ActivityLog.objects.filter(condo_id=condo_id).order_by("-created_at")[:limit]

    def perform_create(self, serializer):
        db_user = _get_internal_user(self.request)
        user_id = db_user.id if db_user else self.request.data.get("user_id")
        serializer.save(user_id=user_id)


# ── Budgets ─────────────────────────────────────────────────────────────────


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer

    def get_queryset(self):
        so_id = self.request.query_params.get("service_order_id")
        condo_id = _get_condo_id(self.request)
        qs = Budget.objects.all()
        if so_id:
            qs = qs.filter(service_order_id=so_id)
        if condo_id:
            qs = qs.filter(condo_id=condo_id)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        db_user = _get_internal_user(self.request)
        extra = {}
        if db_user and not self.request.data.get("created_by_user_id"):
            extra["created_by_user"] = db_user
        serializer.save(**extra)


# ── OS Approvals ────────────────────────────────────────────────────────────


class OSApprovalViewSet(viewsets.ModelViewSet):
    serializer_class = ApprovalSerializer

    def get_queryset(self):
        so_id = self.request.query_params.get("service_order_id")
        condo_id = _get_condo_id(self.request)
        approver_id = self.request.query_params.get("approver_id")

        qs = Approval.objects.all()
        if so_id:
            qs = qs.filter(service_order_id=so_id)
        if condo_id:
            qs = qs.filter(condo_id=condo_id)
        if approver_id:
            qs = qs.filter(approver_id=approver_id)
        return qs.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        records = request.data if isinstance(request.data, list) else [request.data]
        created = []
        for rec in records:
            a = Approval.objects.create(
                service_order_id=rec["service_order_id"],
                condo_id=rec["condo_id"],
                approver_id=rec["approver_id"],
                approver_role=rec["approver_role"],
                approval_type=rec.get("approval_type", ""),
                decision=rec.get("decision", "pendente"),
                justification=rec.get("justification"),
                expires_at=rec.get("expires_at"),
                is_minerva=rec.get("is_minerva", False),
            )
            created.append(str(a.id))
        return Response({"ids": created}, status=status.HTTP_201_CREATED)


# ── Stock Items ─────────────────────────────────────────────────────────────


class StockItemViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = StockItemSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return StockItem.objects.none()
        qs = StockItem.objects.filter(condo_id=condo_id)
        # By default filter out soft-deleted items
        if self.request.query_params.get("include_deleted") != "true":
            qs = qs.filter(deleted_at__isnull=True)
        # Filter by name for exact match lookup
        name = self.request.query_params.get("name")
        if name:
            qs = qs.filter(name=name)
        return qs.order_by("name")

    def get_object(self):
        return StockItem.objects.get(pk=self.kwargs["pk"])


# ── Stock Categories ──────────────────────────────────────────────────────


class StockCategoryViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = StockCategorySerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return StockCategory.objects.none()
        return StockCategory.objects.filter(condo_id=condo_id).order_by("name")

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response({"error": "condo_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        existing = StockCategory.objects.filter(condo_id=condo_id).count()
        if existing > 0:
            return Response(StockCategorySerializer(
                StockCategory.objects.filter(condo_id=condo_id).order_by("name"), many=True
            ).data)

        defaults = [
            {"name": "Máquinas e Equipamentos", "description": "Cortadores de grama, lavadoras, etc."},
            {"name": "Ferramentas", "description": "Ferramentas manuais e elétricas"},
            {"name": "Lubrificantes e Químicos", "description": "Óleos, graxas, produtos químicos"},
            {"name": "Material de Limpeza", "description": "Produtos e utensílios de limpeza"},
            {"name": "Material Elétrico", "description": "Fios, lâmpadas, disjuntores"},
            {"name": "Material Hidráulico", "description": "Tubos, conexões, registros"},
            {"name": "Outros", "description": "Itens não categorizados"},
        ]
        created = []
        for d in defaults:
            created.append(StockCategory.objects.create(condo_id=condo_id, **d))
        return Response(StockCategorySerializer(created, many=True).data, status=status.HTTP_201_CREATED)


# ── Fiscal Document Items ─────────────────────────────────────────────────


class FiscalDocumentItemViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = FiscalDocumentItemSerializer

    def get_queryset(self):
        qs = FiscalDocumentItem.objects.all()
        fiscal_document_id = self.request.query_params.get("fiscal_document_id")
        if fiscal_document_id:
            qs = qs.filter(fiscal_document_id=fiscal_document_id)
        return qs.order_by("-created_at")


# ── Stock Movements ────────────────────────────────────────────────────────


class StockMovementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = StockMovementSerializer

    def get_queryset(self):
        condo_id = _get_condo_id(self.request)
        if not condo_id:
            return StockMovement.objects.none()
        return StockMovement.objects.filter(condo_id=condo_id).order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="balance")
    def balance(self, request):
        condo_id = _get_condo_id(request)
        if not condo_id:
            return Response([])

        items = StockItem.objects.filter(condo_id=condo_id).values("id", "name", "current_qty", "min_qty", "unit")
        return Response(list(items))


# ── Dashboard ───────────────────────────────────────────────────────────────


class DashboardViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
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


# ── Storage (Local) ────────────────────────────────────────────────────────


class StorageViewSet(viewsets.ViewSet):
    parser_classes = [MultiPartParser]

    @action(detail=False, methods=["post"], url_path="upload")
    def upload(self, request):
        bucket = request.data.get("bucket", "uploads")
        path = request.data.get("path", "")
        file = request.FILES.get("file")

        if not file:
            return Response(
                {"error": "file é obrigatório"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not path:
            # Generate a path if not provided
            ext = os.path.splitext(file.name)[1] if file.name else ""
            path = f"{uuid.uuid4().hex}{ext}"

        # Ensure media directory exists
        media_root = getattr(settings, "MEDIA_ROOT", os.path.join(settings.BASE_DIR, "media"))
        upload_dir = os.path.join(media_root, bucket, os.path.dirname(path))
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(media_root, bucket, path)
        with open(file_path, "wb+") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        # Build URL
        media_url = getattr(settings, "MEDIA_URL", "/media/")
        file_url = f"{media_url}{bucket}/{path}"

        return Response(
            {"file_url": file_url, "path": f"{bucket}/{path}"},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="signed-url")
    def signed_url(self, request):
        bucket = request.query_params.get("bucket", "")
        path = request.query_params.get("path", "")
        if not path:
            return Response({"error": "path é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)

        media_url = getattr(settings, "MEDIA_URL", "/media/")
        if bucket:
            file_url = f"{media_url}{bucket}/{path}"
        else:
            file_url = f"{media_url}{path}"

        return Response({"signedUrl": file_url})


# ── Signup Register (composite endpoint) ───────────────────────────────────


class SignupRegisterViewSet(viewsets.ViewSet):
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request):
        serializer = SignupRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 1. Create auth account via Supabase
        result = supabase_auth.sign_up(
            data["email"],
            data["password"],
            data.get("redirect_to"),
        )
        if result["status"] >= 400:
            return Response(result["data"], status=result["status"])

        auth_user_id = result["data"].get("user", {}).get("id")
        if not auth_user_id:
            return Response(
                {"error": "Erro ao criar conta de autenticação"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # 2. Wait for trigger to create user, or create manually
        import time
        user = None
        for _ in range(5):
            try:
                user = User.objects.get(auth_user_id=auth_user_id)
                break
            except User.DoesNotExist:
                time.sleep(0.8)

        if not user:
            user = User.objects.create(
                auth_user_id=auth_user_id,
                full_name=data["full_name"],
                email=data["email"],
                cpf_rg=data.get("cpf_rg") or None,
                birth_date=data.get("birth_date"),
                profile="MORADOR",
                status="pendente",
                condo_id=data["condo_id"],
            )
        else:
            # Update with form data
            user.full_name = data["full_name"]
            user.email = data["email"]
            user.cpf_rg = data.get("cpf_rg") or None
            user.birth_date = data.get("birth_date")
            user.profile = "MORADOR"
            user.status = "pendente"
            user.condo_id = data["condo_id"]
            user.save()

        # 3. Create user_condo
        UserCondo.objects.get_or_create(
            user=user,
            condo_id=data["condo_id"],
            defaults={
                "role": "MORADOR",
                "status": "pendente",
                "is_default": True,
            },
        )

        # 4. Create resident
        Resident.objects.create(
            condo_id=data["condo_id"],
            full_name=data["full_name"],
            email=data["email"],
            document=data.get("cpf_rg") or None,
            block=data.get("block") or None,
            unit=data.get("unit") or None,
            unit_label=data.get("unit_label") or None,
        )

        # 5. Sign out the pending user
        if result["data"].get("access_token"):
            supabase_auth.sign_out(result["data"]["access_token"])

        return Response({"success": True, "user_id": str(user.id)}, status=status.HTTP_201_CREATED)
