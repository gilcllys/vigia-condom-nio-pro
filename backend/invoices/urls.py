from django.urls import path

from . import views

urlpatterns = [
    path("extract/", views.ExtractNFView.as_view(), name="extract-nf"),
]
