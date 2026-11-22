import io
import pytest
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.accounts.models import User
from apps.identity.models import Patient
from apps.documents.models import Document

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def doc_setup(db):
    user = User.objects.create_user(email="staff@clinic.com", password="password")
    patient = Patient.objects.create(given_name="Shakib", family_name="Al Hasan")
    return {"user": user, "patient": patient}

@pytest.mark.django_db
def test_document_upload_and_verification(api_client, doc_setup):
    user = doc_setup["user"]
    patient = doc_setup["patient"]
    api_client.force_authenticate(user=user)

    # 1. Upload report
    file_content = b"%PDF-1.4 test document content"
    test_file = SimpleUploadedFile("cbc_report.pdf", file_content, content_type="application/pdf")

    resp = api_client.post(
        "/api/v1/documents/",
        {"patient_id": str(patient.public_id), "file": test_file},
        format="multipart",
    )
    assert resp.status_code == 201
    doc_id = resp.data["id"]
    assert resp.data["state"] == "OCR_QUEUED"
    assert resp.data["sha256"] != ""

    # 2. Get document
    resp = api_client.get(f"/api/v1/documents/{doc_id}")
    assert resp.status_code == 200

    # 3. Verify extracted fields
    verify_resp = api_client.post(
        f"/api/v1/documents/{doc_id}/extraction/verify",
        {"fields": [{"name": "Hemoglobin", "value": "13.5", "unit": "g/dL"}]},
        format="json",
    )
    assert verify_resp.status_code == 200
    assert verify_resp.data["state"] == "VERIFIED"
