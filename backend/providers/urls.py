from django.urls import path

from . import views

urlpatterns = [
    path("analyze-risk/", views.AnalyzeProviderRiskView.as_view(), name="analyze-provider-risk"),
]
