from django.urls import path
from .views import (
    TriageSessionCreateView,
    TriageSessionDetailView,
    TriageTurnCreateView,
    TriageSummaryConfirmView,
    TriageEndView,
)

urlpatterns = [
    path("sessions", TriageSessionCreateView.as_view(), name="triage-session-create"),
    path("sessions/<uuid:public_id>", TriageSessionDetailView.as_view(), name="triage-session-detail"),
    path("sessions/<uuid:public_id>/turns", TriageTurnCreateView.as_view(), name="triage-turn-create"),
    path("sessions/<uuid:public_id>/summary/confirm", TriageSummaryConfirmView.as_view(), name="triage-summary-confirm"),
    path("sessions/<uuid:public_id>/end", TriageEndView.as_view(), name="triage-end"),
]
