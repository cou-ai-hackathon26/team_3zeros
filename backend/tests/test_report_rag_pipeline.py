"""End-to-end tests for OCR + AI + Medical Book RAG report analysis and senior-doctor referral report history (D-27)."""
import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, PatientAccount, User
from apps.ai.tasks import process_document_ocr
from apps.documents.models import Document
from apps.identity.models import Patient
from apps.organizations.models import Facility, Practitioner
from apps.records.models import Encounter
from tests.kb import make_doc


@pytest.fixture
def report_rag_env(db):
    sender_fac = Facility.objects.create(name="Upazila Health Complex", type="upazila_health_complex")
    receiver_fac = Facility.objects.create(name="Dhaka Medical College", type="district_hospital")

    sender_user = User.objects.create_user(email="sender@uhc.org", password="password12345")
    Membership.objects.create(user=sender_user, facility=sender_fac, role="clinician")
    sender_prac = Practitioner.objects.create(user=sender_user, registration_number="BMDC-91001", name="Dr. Karim")

    senior_user = User.objects.create_user(email="senior@dmc.org", password="password12345")
    Membership.objects.create(
        user=senior_user,
        facility=receiver_fac,
        role="clinician",
        permissions=["referral.acknowledge"],
    )
    Practitioner.objects.create(user=senior_user, registration_number="BMDC-91002", name="Prof. Rahman")

    patient = Patient.objects.create(given_name="Rahim", family_name="Mia", estimated_age=42, sex="male")
    patient_user = User.objects.create_user(phone="+8801799001122", display_name="Rahim Mia")
    PatientAccount.objects.create(user=patient_user, patient=patient)

    Encounter.objects.create(
        patient=patient,
        facility=sender_fac,
        practitioner=sender_prac,
        period_start=timezone.now(),
        encounter_type="outpatient",
        reason="Persistent fever and elevated blood sugar",
    )

    make_doc(
        title="Bangladesh Clinical Lab Handbook",
        approved=True,
        page=42,
        text="Dengue NS1 antigen positive with elevated fasting blood sugar requires close medical evaluation and hydration monitoring.",
    )

    return {
        "patient": patient,
        "patient_user": patient_user,
        "sender_user": sender_user,
        "senior_user": senior_user,
        "sender_fac": sender_fac,
        "receiver_fac": receiver_fac,
    }


@pytest.mark.django_db
def test_patient_upload_runs_ocr_ai_rag_and_shows_positive_negative_in_chart(report_rag_env):
    client = APIClient()
    client.force_authenticate(user=report_rag_env["patient_user"])
    patient = report_rag_env["patient"]

    # Text-bearing report simulating OCR output with positive, high, negative, and normal tests.
    report_bytes = (
        b"Central Diagnostic Lab\n"
        b"Dengue NS1 Antigen: Positive\n"
        b"HBsAg: Negative\n"
        b"Fasting Blood Sugar: 8.6 mmol/L\n"
        b"Hemoglobin: 13.8 g/dL\n"
    )
    uploaded = SimpleUploadedFile("lab_report.png", report_bytes, content_type="image/png")
    # Upload via PDF/image endpoint under the patient's own profile.
    resp = client.post(
        "/api/v1/documents/",
        {"patient_id": str(patient.public_id), "file": SimpleUploadedFile("lab_report.pdf", report_bytes, content_type="application/pdf")},
        format="multipart",
    )
    assert resp.status_code == 201
    doc_id = resp.data["id"]

    # Run OCR + AI + RAG task (in production dispatched by Celery; inline in local runserver).
    process_document_ocr(doc_id)

    doc = Document.objects.get(public_id=doc_id)
    assert doc.state == "EXTRACTED_UNVERIFIED"

    ext = client.get(f"/api/v1/documents/{doc_id}/extraction")
    assert ext.status_code == 200
    fields_by_name = {f["name"].lower(): f for f in ext.data["fields"]}
    assert fields_by_name["dengue ns1 antigen"]["interpretation"] == "positive"
    assert fields_by_name["hbsag"]["interpretation"] == "negative"
    assert fields_by_name["fasting blood sugar"]["interpretation"] == "high"
    assert fields_by_name["hemoglobin"]["interpretation"] == "normal"

    ai_report = ext.data["ai_report"]
    assert ai_report is not None
    assert ai_report["verified"] is False
    assert ai_report["requires_clinician_review"] is True
    assert any("Dengue" in f["test"] for f in ai_report["positive_or_abnormal_findings"])
    assert any("Fasting Blood Sugar" in f["test"] for f in ai_report["positive_or_abnormal_findings"])
    assert any("HBsAg" in f["test"] for f in ai_report["negative_or_normal_findings"])
    assert any("Hemoglobin" in f["test"] for f in ai_report["negative_or_normal_findings"])
    assert ai_report["rag_references"][0]["document"] == "Bangladesh Clinical Lab Handbook"
    assert ai_report["rag_references"][0]["page"] == 42

    # Patient's own dashboard chart includes the analyzed document & report_history.
    chart = client.get(f"/api/v1/patients/{patient.public_id}/chart")
    assert chart.status_code == 200
    assert chart.data["documents"][0]["ai_report"]["summary"]
    assert chart.data["documents"][0]["uploaded_by_role"] == "patient"
    assert chart.data["report_history"]["reports_count"] == 1


@pytest.mark.django_db
def test_clinician_verify_and_senior_doctor_referral_sees_report_history_summary(report_rag_env):
    patient = report_rag_env["patient"]
    sender = APIClient()
    sender.force_authenticate(user=report_rag_env["sender_user"])

    report_bytes = (
        b"Dengue NS1 Antigen: Positive\n"
        b"HBsAg: Negative\n"
        b"Fasting Blood Sugar: 8.6 mmol/L\n"
        b"Hemoglobin: 13.8 g/dL\n"
    )
    up = sender.post(
        "/api/v1/documents/",
        {"patient_id": str(patient.public_id), "file": SimpleUploadedFile("clinic_lab.pdf", report_bytes, content_type="application/pdf")},
        format="multipart",
    )
    assert up.status_code == 201
    doc_id = up.data["id"]
    process_document_ocr(doc_id)

    ext = sender.get(f"/api/v1/documents/{doc_id}/extraction")
    ver = sender.post(
        f"/api/v1/documents/{doc_id}/extraction/verify",
        {"fields": ext.data["fields"]},
        format="json",
    )
    assert ver.status_code == 200
    assert ver.data["state"] == "VERIFIED"
    assert ver.data["ai_report"]["verified"] is True

    # Verified findings appear in prior results even when uploaded without explicit encounter_id.
    prior = sender.get(f"/api/v1/patients/{patient.public_id}/results")
    assert prior.status_code == 200
    prior_names = {r["display_name"].lower() for r in prior.data["results"]}
    assert "dengue ns1 antigen" in prior_names

    # Sending doctor creates referral to senior specialist hospital.
    ref_resp = sender.post(
        "/api/v1/referrals/",
        {
            "patient_id": str(patient.public_id),
            "receiver_facility_id": str(report_rag_env["receiver_fac"].public_id),
            "urgency": "urgent",
            "reason": "Needs senior internal medicine review for dengue with hyperglycemia",
        },
        format="json",
    )
    assert ref_resp.status_code == 201
    ref_id = ref_resp.data["id"]
    # Initial draft summary is automatically pre-populated with report history & document citations.
    sections = ref_resp.data["summary"]["sections"]
    assert len(sections) >= 1
    assert sections[0]["name"] == "Prior Tests & Report History"
    assert any("Positive / abnormal" in st["text"] for st in sections[0]["statements"])
    assert any("Negative / normal" in st["text"] for st in sections[0]["statements"])

    # Structured report_history is directly attached for both sending and receiving senior doctors.
    rh = ref_resp.data["report_history"]
    assert rh["reports_count"] == 1
    assert rh["verified_reports_count"] == 1
    assert any(x["name"].lower() == "dengue ns1 antigen" and x["interpretation"] == "positive" for x in rh["positive_or_abnormal"])
    assert any(x["name"].lower() == "hbsag" and x["interpretation"] == "negative" for x in rh["negative_or_normal"])
    assert "Dengue Ns1 Antigen" in rh["concise_summary"] or "Dengue NS1 Antigen" in rh["concise_summary"]
