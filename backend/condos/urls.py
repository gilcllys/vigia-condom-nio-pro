from django.urls import path

from . import views

urlpatterns = [
    path("invite/generate/", views.GenerateInviteView.as_view(), name="generate-invite"),
]
