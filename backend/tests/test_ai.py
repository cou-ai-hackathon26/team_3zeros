import pytest
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from apps.ai.adapters import (
    validate_referral_draft_schema,
    MockLLMAdapter,
    MockOCRAdapter,
    GeminiLLMAdapter,
    OpenAILLMAdapter,
    TesseractOCRAdapter,
    get_llm_adapter,
    get_ocr_adapter,
)
from apps.ai.tasks import process_document_ocr, generate_referral_draft_task
from apps.workflow.tasks import dispatch_outbox_events
from apps.workflow.models import OutboxEvent
from apps.common.exceptions import ValidationError
from apps.accounts.models import User, Membership
from apps.organizations.models import Facility, Practitioner
from apps.identity.models import Patient
from apps.documents.models import Document, ExtractionJob, ExtractedField
from apps.referrals.models import Referral, ReferralDraftVersion


def test_referral_draft_schema_validation_success():
    valid_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "Suspected pulmonary tuberculosis.",
                        "source_refs": ["document:uuid-abc#page=1"],
                    }
                ],
            },
            {
                "name": "Missing or Uncertain Information",
                "statements": [
                    {
                        "text": "Sputum test date unknown.",
                        "source_refs": [],
                    }
                ],
            },
        ]
    }
    # Should not raise
    validate_referral_draft_schema(valid_draft)


def test_referral_draft_schema_rejects_missing_source_refs():
    invalid_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "Suspected diabetes mellitus.",
                        "source_refs": [],  # Missing source_refs outside missing info section!
                    }
                ],
            }
        ]
    }
    with pytest.raises(ValidationError) as exc:
        validate_referral_draft_schema(invalid_draft)
    assert "missing source_refs" in str(exc.value)


def test_referral_draft_schema_rejects_invented_placeholders():
    placeholder_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "N/A",  # Model invented placeholder!
                        "source_refs": ["document:uuid-123"],
                    }
                ],
            }
        ]
    }
    with pytest.raises(ValidationError) as exc:
        validate_referral_draft_schema(placeholder_draft)
    assert "Invalid model-invented placeholder" in str(exc.value)


def test_mock_llm_adapter():
    adapter = MockLLMAdapter()
    result = adapter.generate(schema={}, messages=[])
    assert "sections" in result
    validate_referral_draft_schema(result)


def test_mock_ocr_adapter():
    adapter = MockOCRAdapter()
    results = adapter.extract(b"dummy pdf bytes")
    assert len(results) >= 3
    for field in results:
        assert "name" in field
        assert "value" in field
        assert "confidence" in field
        assert "bbox" in field


def test_adapter_factories(settings):
    settings.LLM_PROVIDER = "mock"
    settings.OCR_PROVIDER = "mock"
    assert isinstance(get_llm_adapter(), MockLLMAdapter)
    assert isinstance(get_ocr_adapter(), MockOCRAdapter)

    settings.LLM_PROVIDER = "gemini"
    assert isinstance(get_llm_adapter(), GeminiLLMAdapter)

    settings.LLM_PROVIDER = "openai"
    assert isinstance(get_llm_adapter(), OpenAILLMAdapter)

    settings.OCR_PROVIDER = "tesseract"
    assert isinstance(get_ocr_adapter(), TesseractOCRAdapter)


def test_gemini_adapter_without_key():
    adapter = GeminiLLMAdapter(api_key="")
    with pytest.raises(ValidationError) as exc:
        adapter.generate(schema={}, messages=[])
    assert "Gemini API key is not configured" in str(exc.value)


def test_gemini_adapter_successful_call():
    adapter = GeminiLLMAdapter(api_key="test-gemini-key")
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"sections": [{"name": "Clinical Reason", "statements": [{"text": "Pneumonia", "source_refs": ["document:doc-1#page=1"]}]}]}'
                        }
                    ]
                }
            }
        ]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("requests.post", return_value=mock_resp):
        result = adapter.generate(schema={}, messages=[{"role": "user", "content": "summarize"}])
        assert "sections" in result
        assert result["sections"][0]["statements"][0]["text"] == "Pneumonia"


def test_openai_adapter_without_key():
    adapter = OpenAILLMAdapter(api_key="")
    with pytest.raises(ValidationError) as exc:
        adapter.generate(schema={}, messages=[])
    assert "OpenAI API key is not configured" in str(exc.value)


def test_openai_adapter_successful_call():
    adapter = OpenAILLMAdapter(api_key="test-openai-key")
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": '{"sections": [{"name": "Clinical Reason", "statements": [{"text": "Hypertension", "source_refs": ["fhir:Observation/bp-1"]}]}]}'
                }
            }
        ]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("requests.post", return_value=mock_resp):
        result = adapter.generate(schema={}, messages=[{"role": "user", "content": "summarize"}])
        assert "sections" in result
        assert result["sections"][0]["statements"][0]["text"] == "Hypertension"


def test_tesseract_adapter_extraction():
    adapter = TesseractOCRAdapter()
    results = adapter.extract(b"Report: Hemoglobin = 12.5 g/dl\nWBC = 6500 /cumm\nPlatelets = 220000")
    assert len(results) >= 1
    names = [r["name"] for r in results]
    assert any(n in names for n in ["Hemoglobin", "WBC Count", "Platelet Count"])


@pytest.mark.django_db
def test_process_document_ocr_task():
    patient = Patient.objects.create(given_name="Rakib", family_name="Hasan")
    storage_key = "documents/test_ocr_sample.pdf"
    default_storage.save(storage_key, ContentFile(b"test pdf content with hemoglobin 14.0 g/dl"))

    doc = Document.objects.create(
        patient=patient,
        storage_key=storage_key,
        original_filename="sample.pdf",
        content_type="application/pdf",
        size=100,
        sha256="abcd1234ef",
        state="OCR_QUEUED",
    )

    process_document_ocr(str(doc.public_id))

    doc.refresh_from_db()
    assert doc.state == "EXTRACTED_UNVERIFIED"

    job = doc.extraction_jobs.first()
    assert job is not None
    assert job.fields.count() >= 1

    outbox = OutboxEvent.objects.filter(
        aggregate_type="document",
        aggregate_id=doc.public_id,
        event_type="document.extraction_ready",
    ).first()
    assert outbox is not None


@pytest.mark.django_db
def test_generate_referral_draft_task():
    user = User.objects.create_user(email="doc@hospital.com", password="password")
    facility = Facility.objects.create(name="Upazila Health Complex", type="upazila_health_complex")
    Membership.objects.create(user=user, facility=facility, role="clinician")
    practitioner = Practitioner.objects.create(user=user, registration_number="BMDC-78901")
    patient = Patient.objects.create(given_name="Tamim", family_name="Iqbal", estimated_age=35, sex="male")

    referral = Referral.objects.create(
        patient=patient,
        sender_facility=facility,
        sender_practitioner=practitioner,
        receiver_facility=facility,
        reason="Severe chest discomfort and fatigue",
        urgency="urgent",
        state="DRAFT",
        summary={"sections": []},
    )

    generate_referral_draft_task(str(referral.public_id))

    referral.refresh_from_db()
    assert referral.summary_origin == "ai_draft_edited"
    assert len(referral.summary.get("sections", [])) > 0
    validate_referral_draft_schema(referral.summary)

    version = ReferralDraftVersion.objects.filter(referral=referral, origin="ai_draft").first()
    assert version is not None

    outbox = OutboxEvent.objects.filter(
        aggregate_type="referral",
        aggregate_id=referral.public_id,
        event_type="referral.draft_ready",
    ).first()
    assert outbox is not None


@pytest.mark.django_db
def test_dispatch_outbox_events_task():
    patient = Patient.objects.create(given_name="Nasir", family_name="Hossain")
    doc = Document.objects.create(
        patient=patient,
        storage_key="documents/dispatched_sample.pdf",
        original_filename="sample.pdf",
        content_type="application/pdf",
        size=50,
        sha256="12345678",
        state="OCR_QUEUED",
    )
    event = OutboxEvent.objects.create(
        aggregate_type="document",
        aggregate_id=doc.public_id,
        event_type="document.uploaded",
        payload={"id": str(doc.public_id)},
    )

    dispatched = dispatch_outbox_events(batch_size=10)
    assert dispatched >= 1

    event.refresh_from_db()
    assert event.dispatched_at is not None


@pytest.mark.django_db
def test_health_check_endpoint(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
    assert data["cache"] == "ok"
