"""Verify that every canonical endpoint in MASTERPLAN.md §6.3 resolves in Django URLs."""
import uuid
import pytest
from django.urls import resolve

SAMPLE_UUID = str(uuid.uuid4())
SAMPLE_UUID_2 = str(uuid.uuid4())

CANONICAL_PATHS = [
    "/api/v1/auth/login",
    "/api/v1/auth/mfa/verify",
    "/api/v1/auth/otp/request",
    "/api/v1/auth/otp/verify",
    "/api/v1/auth/logout",
    "/api/v1/auth/me",
    "/api/v1/auth/active-facility",
    "/api/v1/patients/",
    f"/api/v1/patients/{SAMPLE_UUID}",
    f"/api/v1/patients/{SAMPLE_UUID}/duplicate-candidates",
    f"/api/v1/patients/{SAMPLE_UUID}/duplicate-candidates/{SAMPLE_UUID_2}/resolve",
    f"/api/v1/patients/{SAMPLE_UUID}/chart",
    f"/api/v1/patients/{SAMPLE_UUID}/encounters",
    f"/api/v1/patients/{SAMPLE_UUID}/results",
    "/api/v1/directory/areas",
    "/api/v1/directory/specialties",
    "/api/v1/directory/practitioners",
    "/api/v1/directory/facilities",
    f"/api/v1/practitioners/{SAMPLE_UUID}/slots",
    "/api/v1/appointments",
    f"/api/v1/appointments/{SAMPLE_UUID}",
    f"/api/v1/appointments/{SAMPLE_UUID}/actions/accept",
    "/api/v1/triage/sessions",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}/voice-credentials",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}/turns",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}/finish",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}/summary/confirm",
    f"/api/v1/triage/sessions/{SAMPLE_UUID}/end",
    "/api/v1/triage/provider-events",
    f"/api/v1/encounters/{SAMPLE_UUID}",
    f"/api/v1/encounters/{SAMPLE_UUID}/observations",
    f"/api/v1/encounters/{SAMPLE_UUID}/allergies",
    f"/api/v1/encounters/{SAMPLE_UUID}/medications",
    "/api/v1/documents/",
    f"/api/v1/documents/{SAMPLE_UUID}",
    f"/api/v1/documents/{SAMPLE_UUID}/download-link",
    f"/api/v1/documents/{SAMPLE_UUID}/extraction",
    f"/api/v1/documents/{SAMPLE_UUID}/extraction/verify",
    f"/api/v1/documents/{SAMPLE_UUID}/extraction/reject",
    f"/api/v1/documents/{SAMPLE_UUID}/actions/retry_ocr",
    "/api/v1/referrals/",
    f"/api/v1/referrals/{SAMPLE_UUID}",
    f"/api/v1/referrals/{SAMPLE_UUID}/generate-draft",
    f"/api/v1/referrals/{SAMPLE_UUID}/actions/approve",
    "/api/v1/referrals/emergency",
    "/api/v1/referrals/by-reference/REF-1234",
    "/api/v1/devices/enroll",
    f"/api/v1/devices/{SAMPLE_UUID}/revoke",
    "/api/v1/consents/",
    f"/api/v1/consents/{SAMPLE_UUID}/revoke",
    f"/api/v1/consent-requests/{SAMPLE_UUID}",
    f"/api/v1/consent-requests/{SAMPLE_UUID}/grant",
    f"/api/v1/consent-requests/{SAMPLE_UUID}/refuse",
    "/api/v1/notifications/",
    f"/api/v1/notifications/{SAMPLE_UUID}/read",
    "/api/v1/audit/events/",
]


@pytest.mark.parametrize("path", CANONICAL_PATHS)
def test_masterplan_canonical_url_resolves(path):
    match = resolve(path)
    assert match.func is not None
