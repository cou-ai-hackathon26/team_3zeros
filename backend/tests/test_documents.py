import io
import pytest
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.accounts.models import User, Membership
from apps.organizations.models import Facility
from apps.common.exceptions import FhirUnavailableError
from apps.fhir.client import FhirClient
from apps.workflow.engine import execute_transition
from apps.documents.transitions import DOCUMENT_TRANSITIONS
from apps.identity.models import Patient
from apps.documents.models import Document

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def doc_setup(db):
    user = User.objects.create_user(email="staff@clinic.com", password="password")
    Membership.objects.create(
        user=user, facility=Facility.objects.create(name="Clinic", type="private_clinic"), role="clinician"
    )
    patient = Patient.objects.create(given_name="Shakib", family_name="Al Hasan")
    return {"user": user, "patient": patient}


def upload(api_client, patient):
    f = SimpleUploadedFile("cbc_report.pdf", b"%PDF-1.4 test document content", content_type="application/pdf")
    resp = api_client.post(
        "/api/v1/documents/", {"patient_id": str(patient.public_id), "file": f}, format="multipart"
    )
    assert resp.status_code == 201
    return resp.data["id"]


def run_ocr(doc_id):
    """Stand in for the OCR worker: the system moves the document to EXTRACTED_UNVERIFIED."""
    doc = Document.objects.get(public_id=doc_id)
    doc.TRANSITIONS = DOCUMENT_TRANSITIONS
    execute_transition(doc, "start_ocr", None)
    execute_transition(doc, "ocr_succeeded", None)


VERIFY_BODY = {"fields": [{"name": "Hemoglobin", "value": "13.5", "unit": "g/dL"}]}


@pytest.mark.django_db
def test_document_upload_and_verification(api_client, doc_setup):
    api_client.force_authenticate(user=doc_setup["user"])
    doc_id = upload(api_client, doc_setup["patient"])
    assert api_client.get(f"/api/v1/documents/{doc_id}").status_code == 200
    assert Document.objects.get(public_id=doc_id).state == "OCR_QUEUED"

    run_ocr(doc_id)
    resp = api_client.post(f"/api/v1/documents/{doc_id}/extraction/verify", VERIFY_BODY, format="json")
    assert resp.status_code == 200
    assert resp.data["state"] == "VERIFIED"


@pytest.mark.django_db
def test_cannot_verify_before_extraction(api_client, doc_setup):
    api_client.force_authenticate(user=doc_setup["user"])
    doc_id = upload(api_client, doc_setup["patient"])  # still OCR_QUEUED
    resp = api_client.post(f"/api/v1/documents/{doc_id}/extraction/verify", VERIFY_BODY, format="json")
    assert resp.status_code == 409
    assert Document.objects.get(public_id=doc_id).state == "OCR_QUEUED"


@pytest.mark.django_db
def test_only_a_clinician_can_verify_or_reject(api_client, doc_setup):
    api_client.force_authenticate(user=doc_setup["user"])
    doc_id = upload(api_client, doc_setup["patient"])
    run_ocr(doc_id)
    nurse = User.objects.create_user(email="nurse@clinic.com", password="password")
    api_client.force_authenticate(user=nurse)
    for path, body in (("verify", VERIFY_BODY), ("reject", {})):
        resp = api_client.post(f"/api/v1/documents/{doc_id}/extraction/{path}", body, format="json")
        assert resp.status_code in (403, 404)
    assert Document.objects.get(public_id=doc_id).state == "EXTRACTED_UNVERIFIED"


@pytest.mark.django_db
def test_verify_is_pending_while_fhir_is_down(api_client, doc_setup, settings, monkeypatch):
    settings.FHIR_SYNC_MODE = "live"
    api_client.force_authenticate(user=doc_setup["user"])
    doc_id = upload(api_client, doc_setup["patient"])
    run_ocr(doc_id)

    def down(self, bundle):
        raise FhirUnavailableError("down")

    monkeypatch.setattr(FhirClient, "execute_transaction_bundle", down)
    resp = api_client.post(f"/api/v1/documents/{doc_id}/extraction/verify", VERIFY_BODY, format="json")
    assert resp.status_code == 202
    doc = Document.objects.get(public_id=doc_id)
    assert doc.state == "EXTRACTED_UNVERIFIED" and doc.pending_action == "verify"


@pytest.mark.django_db
def test_patient_chart_includes_non_quarantined_documents(api_client, doc_setup):
    from apps.accounts.models import PatientAccount

    patient = doc_setup["patient"]
    patient_user = User.objects.create_user(phone="+8801766666661", display_name="Shakib")
    PatientAccount.objects.create(user=patient_user, patient=patient)

    d_verified = Document.objects.create(
        patient=patient,
        uploaded_by=doc_setup["user"],
        storage_key="documents/demo-verified",
        original_filename="verified_cbc.pdf",
        content_type="application/pdf",
        size=1024,
        sha256="a" * 64,
        state="VERIFIED",
    )
    Document.objects.create(
        patient=patient,
        uploaded_by=doc_setup["user"],
        storage_key="documents/demo-quarantined",
        original_filename="bad_file.pdf",
        content_type="application/pdf",
        size=512,
        sha256="b" * 64,
        state="QUARANTINED",
    )

    api_client.force_authenticate(user=patient_user)
    resp = api_client.get(f"/api/v1/patients/{patient.public_id}/chart")
    assert resp.status_code == 200
    assert "documents" in resp.data
    assert [d["id"] for d in resp.data["documents"]] == [str(d_verified.public_id)]

