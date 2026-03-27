from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import auth_views
from .viewsets import (
    ActivityLogViewSet,
    BudgetViewSet,
    CondoViewSet,
    ContractViewSet,
    DashboardViewSet,
    FiscalDocumentApprovalViewSet,
    FiscalDocumentItemViewSet,
    FiscalDocumentViewSet,
    OSApprovalViewSet,
    PendingUserApprovalViewSet,
    ProviderViewSet,
    ResidentViewSet,
    ServiceOrderActivityViewSet,
    ServiceOrderMaterialViewSet,
    ServiceOrderPhotoViewSet,
    ServiceOrderViewSet,
    SignupRegisterViewSet,
    StockCategoryViewSet,
    StockItemViewSet,
    StockMovementViewSet,
    StorageViewSet,
    TicketViewSet,
    UserCondoViewSet,
    UserSessionViewSet,
    UserViewSet,
)

router = DefaultRouter(trailing_slash=True)

# ── Register ViewSets ────────────────────────────────────────────────────
router.register(r"data/users", UserViewSet, basename="users")
router.register(r"data/user-sessions", UserSessionViewSet, basename="user-sessions")
router.register(r"data/condos", CondoViewSet, basename="condos")
router.register(r"data/residents", ResidentViewSet, basename="residents")
router.register(r"data/user-condos", UserCondoViewSet, basename="user-condos")
router.register(r"data/fiscal-documents", FiscalDocumentViewSet, basename="fiscal-documents")
router.register(r"data/approvals", FiscalDocumentApprovalViewSet, basename="approvals")
router.register(r"data/service-orders", ServiceOrderViewSet, basename="service-orders")
router.register(r"data/service-order-materials", ServiceOrderMaterialViewSet, basename="service-order-materials")
router.register(r"data/tickets", TicketViewSet, basename="tickets")
router.register(r"data/providers", ProviderViewSet, basename="providers")
router.register(r"data/contracts", ContractViewSet, basename="contracts")
router.register(r"data/activity-logs", ActivityLogViewSet, basename="activity-logs")
router.register(r"data/budgets", BudgetViewSet, basename="budgets")
router.register(r"data/os-approvals", OSApprovalViewSet, basename="os-approvals")
router.register(r"data/stock-items", StockItemViewSet, basename="stock-items")
router.register(r"data/stock-categories", StockCategoryViewSet, basename="stock-categories")
router.register(r"data/stock-movements", StockMovementViewSet, basename="stock-movements")
router.register(r"data/fiscal-document-items", FiscalDocumentItemViewSet, basename="fiscal-document-items")
router.register(r"data/pending-user-approvals", PendingUserApprovalViewSet, basename="pending-user-approvals")
router.register(r"data/dashboard", DashboardViewSet, basename="dashboard")
router.register(r"data/storage", StorageViewSet, basename="storage")
router.register(r"data/signup-register", SignupRegisterViewSet, basename="signup-register")

urlpatterns = [
    # ── Auth (proxy to Supabase GoTrue) ──────────────────────────────────────
    path("auth/login/", auth_views.LoginView.as_view()),
    path("auth/signup/", auth_views.SignUpView.as_view()),
    path("auth/logout/", auth_views.LogoutView.as_view()),
    path("auth/refresh/", auth_views.RefreshTokenView.as_view()),
    path("auth/forgot-password/", auth_views.ForgotPasswordView.as_view()),
    path("auth/update-user/", auth_views.UpdateUserView.as_view()),
    path("auth/user/", auth_views.GetUserView.as_view()),
    path("auth/session/", auth_views.SessionView.as_view()),
    path("auth/mfa/factors/", auth_views.MfaListFactorsView.as_view()),
    path("auth/mfa/enroll/", auth_views.MfaEnrollView.as_view()),
    path("auth/mfa/challenge/", auth_views.MfaChallengeView.as_view()),
    path("auth/mfa/verify/", auth_views.MfaVerifyView.as_view()),
    path("auth/mfa/unenroll/", auth_views.MfaUnenrollView.as_view()),
    path("auth/mfa/aal-level/", auth_views.MfaAalLevelView.as_view()),

    # ── Nested SO resources (not easily handled by flat routers) ─────────
    path(
        "data/service-orders/<uuid:so_id>/photos/",
        ServiceOrderPhotoViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "data/service-orders/<uuid:so_id>/activities/",
        ServiceOrderActivityViewSet.as_view({"get": "list", "post": "create"}),
    ),

    # ── Router URLs ──────────────────────────────────────────────────────
    path("", include(router.urls)),
]
