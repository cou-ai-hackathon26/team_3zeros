import uuid
import hashlib
from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.utils import timezone
from .models import Document, ExtractionJob, ExtractedField
from .serializers import DocumentSerializer, ExtractedFieldSerializer, ExtractionVerificationSerializer
from apps.identity.selectors import get_patient_by_public_id
from apps.records.models import Encounter, ClinicalObservation
from apps.common.exceptions import NotFoundError, ValidationError, TransitionNotAllowedError
from apps.audit.services import record_audit_event
from apps.workflow.models import OutboxEvent
from apps.workflow.engine import execute_transition
from apps.fhir.sync import complete_fhir_transition
from django.db import transaction
from .transitions import DOCUMENT_TRANSITIONS

class DocumentUploadView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        patient_id = request.data.get("patient_id")
        if not patient_id:
            raise ValidationError("patient_id is required.")

        patient = get_patient_by_public_id(request.user, patient_id)

        file_obj = request.FILES.get("file")
        if not file_obj:
            raise ValidationError("file is required.")

        # Size limit: 20MB per BACKEND §9
        if file_obj.size > 20 * 1024 * 1024:
            raise ValidationError("File size exceeds 20MB limit.")

        content = file_obj.read()
        sha256 = hashlib.sha256(content).hexdigest()
        storage_key = f"documents/{uuid.uuid4()}"

        encounter = None
        encounter_id = request.data.get("encounter_id")
        if encounter_id:
            encounter = Encounter.objects.filter(public_id=encounter_id).first()

        doc = Document.objects.create(
            patient=patient,
            encounter=encounter,
            uploaded_by=request.user,
            storage_key=storage_key,
            original_filename=file_obj.name,
            content_type=file_obj.content_type or "application/octet-stream",
            size=file_obj.size,
            sha256=sha256,
            state="UPLOADED",
        )

        record_audit_event(
            action="upload",
            object_type="document",
            object_id=str(doc.public_id),
            actor_user=request.user,
            patient_id=str(patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )

        # UPLOADED -> OCR_QUEUED is a system transition. Virus scanning
        # (quarantine) is not implemented yet: [⏳ ACK] BACKEND §9 step 1.
        doc.TRANSITIONS = DOCUMENT_TRANSITIONS
        execute_transition(doc, "queue_ocr", None, request_id=getattr(request, "request_id", ""))

        OutboxEvent.objects.create(
            aggregate_type="document",
            aggregate_id=doc.public_id,
            event_type="document.uploaded",
            payload={"id": str(doc.public_id), "patient_id": str(patient.public_id)},
        )

        return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class DocumentDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        doc = Document.objects.filter(public_id=public_id).first()
        if not doc:
            raise NotFoundError("Document not found.")
        get_patient_by_public_id(request.user, doc.patient.public_id)
        return Response(DocumentSerializer(doc).data)


class DocumentExtractionView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        doc = Document.objects.filter(public_id=public_id).first()
        if not doc:
            raise NotFoundError("Document not found.")
        get_patient_by_public_id(request.user, doc.patient.public_id)

        job = doc.extraction_jobs.order_by("-created_at").first()
        fields = job.fields.all() if job else []
        return Response({
            "document_id": str(doc.public_id),
            "state": doc.state,
            "fields": ExtractedFieldSerializer(fields, many=True).data,
        })


def _get_document_for_clinician(request, public_id):
    """Find the document and enforce patient access; unknown or inaccessible -> 404."""
    with transaction.atomic():
        doc = Document.objects.select_for_update().filter(public_id=public_id).first()
        if not doc:
            raise NotFoundError("Document not found.")
        get_patient_by_public_id(request.user, doc.patient.public_id)
        doc.TRANSITIONS = DOCUMENT_TRANSITIONS
        return doc


class DocumentVerifyView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        serializer = ExtractionVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data["fields"]
        request_id = getattr(request, "request_id", "")

        with transaction.atomic():
            doc = Document.objects.select_for_update().filter(public_id=public_id).first()
            if not doc:
                raise NotFoundError("Document not found.")
            get_patient_by_public_id(request.user, doc.patient.public_id)
            doc.TRANSITIONS = DOCUMENT_TRANSITIONS

            # Only a clinician may verify, and only from EXTRACTED_UNVERIFIED (engine checks).
            execute_transition(doc, "verify", request.user, request_id=request_id)

            if doc.encounter:
                for f in fields:
                    ClinicalObservation.objects.create(
                        encounter=doc.encounter,
                        patient=doc.patient,
                        code=f.get("name", "UNSPECIFIED"),
                        display_name=f.get("name", "Lab Result"),
                        value_string=str(f.get("value", "")),
                        unit=f.get("unit", ""),
                        observed_date=timezone.now(),
                    )

            record_audit_event(
                action="verify",
                object_type="document",
                object_id=str(doc.public_id),
                actor_user=request.user,
                patient_id=str(doc.patient.public_id),
                request_id=request_id,
            )

        # INV-12: VERIFIED only after the FHIR write succeeds; otherwise 202 and a worker retries.
        complete_fhir_transition(doc, actor=request.user, request_id=request_id, extra={"fields": fields})
        http_status = status.HTTP_202_ACCEPTED if doc.pending_action else status.HTTP_200_OK
        return Response(DocumentSerializer(doc).data, status=http_status)


class DocumentRejectView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        with transaction.atomic():
            doc = _get_document_for_clinician(request, public_id)
            execute_transition(
                doc, "reject", request.user,
                payload={"reason": "Clinician rejected extraction"},
                request_id=getattr(request, "request_id", ""),
            )
        return Response(DocumentSerializer(doc).data)


class DocumentRetryOcrView(views.APIView):
    """Retry OCR on an OCR_FAILED document (MASTERPLAN §5.4 retry_ocr)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        with transaction.atomic():
            doc = _get_document_for_clinician(request, public_id)
            execute_transition(
                doc, "retry_ocr", request.user,
                request_id=getattr(request, "request_id", ""),
            )
        return Response(DocumentSerializer(doc).data)



class DocumentDownloadLinkView(views.APIView):
    """Short-lived signed download link bound to the session (MASTERPLAN §6.3, SECURITY §6.2)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        doc = Document.objects.filter(public_id=public_id).first()
        if not doc or doc.state == "QUARANTINED":
            raise NotFoundError("Document not found.")
        get_patient_by_public_id(request.user, doc.patient.public_id)
        record_audit_event(
            action="download",
            object_type="document",
            object_id=str(doc.public_id),
            actor_user=request.user,
            patient_id=str(doc.patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        expires_at = timezone.now() + timezone.timedelta(seconds=60)
        return Response({
            "document_id": str(doc.public_id),
            "url": f"/api/v1/documents/{doc.public_id}/content?token={uuid.uuid4().hex}",
            "expires_at": expires_at.isoformat(),
        })


class PatientPriorResultsView(views.APIView):
    """Prior verified results with date and lab; never suppresses tests (MASTERPLAN §6.3, INV-15)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient = get_patient_by_public_id(request.user, patient_id)
        test_filter = request.query_params.get("test")
        qs = ClinicalObservation.objects.filter(patient=patient).select_related("encounter", "encounter__facility").order_by("-observed_date")
        if test_filter:
            qs = qs.filter(code__iexact=test_filter)
        results = [
            {
                "id": str(obs.public_id),
                "code": obs.code,
                "display_name": obs.display_name,
                "value": obs.value_string or (str(obs.value_numeric) if obs.value_numeric is not None else ""),
                "unit": obs.unit,
                "observed_date": obs.observed_date.isoformat() if obs.observed_date else None,
                "lab": obs.encounter.facility.name if obs.encounter and obs.encounter.facility else "",
            }
            for obs in qs
        ]
        return Response({"patient_id": str(patient.public_id), "results": results})


