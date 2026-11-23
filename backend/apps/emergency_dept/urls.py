from django.urls import path
from .views import (
    EDVisitListCreateView,
    EDVisitDetailView,
    EDVisitActionView,
)

urlpatterns = [
    path("ed-visits", EDVisitListCreateView.as_view(), name="ed-visits-list-create"),
    path("ed-visits/<uuid:id>", EDVisitDetailView.as_view(), name="ed-visits-detail"),
    path("ed-visits/<uuid:id>/actions/<str:action>", EDVisitActionView.as_view(), name="ed-visits-action"),
]

