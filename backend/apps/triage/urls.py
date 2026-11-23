from django.urls import path
from .views import (
    TriageSessionCreateView,
    TriageSessionDetailView,
    TriageVoiceCredentialsView,
    TriageTurnCreateView,
    TriagePauseView,
    TriageResumeView,
    TriageSummaryConfirmView,
    TriageEndView,
    TriageFinishView,
    TriageProviderEventsView,
)

urlpatterns = [
    path("sessions", TriageSessionCreateView.as_view(), name="triage-session-create"),
    path("sessions/<uuid:public_id>", TriageSessionDetailView.as_view(), name="triage-session-detail"),
    path("sessions/<uuid:public_id>/voice-credentials", TriageVoiceCredentialsView.as_view(), name="triage-voice-credentials"),
    path("sessions/<uuid:public_id>/turns", TriageTurnCreateView.as_view(), name="triage-turn-create"),
    path("sessions/<uuid:public_id>/pause", TriagePauseView.as_view(), name="triage-pause"),
    path("sessions/<uuid:public_id>/resume", TriageResumeView.as_view(), name="triage-resume"),
    path("sessions/<uuid:public_id>/summary/confirm", TriageSummaryConfirmView.as_view(), name="triage-summary-confirm"),
    path("sessions/<uuid:public_id>/finish", TriageFinishView.as_view(), name="triage-finish"),
    path("sessions/<uuid:public_id>/end", TriageEndView.as_view(), name="triage-end"),
    path("provider-events", TriageProviderEventsView.as_view(), name="triage-provider-events"),
]
