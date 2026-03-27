from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path("api/", include("core.urls")),
    path("api/subscriptions/", include("subscriptions.urls")),
    path("api/invoices/", include("invoices.urls")),
    path("api/providers/", include("providers.urls")),
    path("api/condos/", include("condos.urls")),
    path("api/notifications/", include("notifications.urls")),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
