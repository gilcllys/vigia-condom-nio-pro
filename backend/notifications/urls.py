from django.urls import path

from . import views

urlpatterns = [
    path("approval-email/", views.SendApprovalEmailView.as_view(), name="send-approval-email"),
]
