from django.urls import path
from .views import (
    PatientConsentsView,
    ConsentRequestDetailView,
    GrantConsentRequestView,
    RefuseConsentRequestView,
    RevokeConsentView,
)

urlpatterns = [
    path("", PatientConsentsView.as_view(), name="patient-consents"),
    path("requests/<uuid:public_id>", ConsentRequestDetailView.as_view(), name="consent-request-detail"),
    path("requests/<uuid:public_id>/grant", GrantConsentRequestView.as_view(), name="consent-request-grant"),
    path("requests/<uuid:public_id>/refuse", RefuseConsentRequestView.as_view(), name="consent-request-refuse"),
    path("<uuid:public_id>/revoke", RevokeConsentView.as_view(), name="consent-revoke"),
]

