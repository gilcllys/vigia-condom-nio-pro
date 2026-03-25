from django.urls import path

from . import views

urlpatterns = [
    path("create/", views.CreateSubscriptionView.as_view(), name="create-subscription"),
    path("webhook/", views.PagarmeWebhookView.as_view(), name="pagarme-webhook"),
]
