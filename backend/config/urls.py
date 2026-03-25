from django.urls import include, path

urlpatterns = [
    path("api/subscriptions/", include("subscriptions.urls")),
    path("api/invoices/", include("invoices.urls")),
    path("api/providers/", include("providers.urls")),
    path("api/condos/", include("condos.urls")),
    path("api/notifications/", include("notifications.urls")),
]
