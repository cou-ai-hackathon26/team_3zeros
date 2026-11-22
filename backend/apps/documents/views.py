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

        # Trigger OCR job creation / event
        doc.state = "OCR_QUEUED"
        doc.save()

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


class DocumentVerifyView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        doc = Document.objects.filter(public_id=public_id).first()
        if not doc:
            raise NotFoundError("Document not found.")

        serializer = ExtractionVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create or update verified observations in patient chart
        for f in serializer.validated_data["fields"]:
            if doc.encounter:
                ClinicalObservation.objects.create(
                    encounter=doc.encounter,
                    patient=doc.patient,
                    code=f.get("name", "UNSPECIFIED"),
                    display_name=f.get("name", "Lab Result"),
                    value_string=str(f.get("value", "")),
                    unit=f.get("unit", ""),
                    observed_date=timezone.now(),
                )

        doc.state = "VERIFIED"
        doc.save()

        record_audit_event(
            action="verify",
            object_type="document",
            object_id=str(doc.public_id),
            actor_user=request.user,
            patient_id=str(doc.patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(DocumentSerializer(doc).data)


class DocumentRejectView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        doc = Document.objects.filter(public_id=public_id).first()
        if not doc:
            raise NotFoundError("Document not found.")

        doc.state = "REJECTED"
        doc.save()

        record_audit_event(
            action="update",
            object_type="document",
            object_id=str(doc.public_id),
            actor_user=request.user,
            patient_id=str(doc.patient.public_id),
            reason="Clinician rejected extraction",
            request_id=getattr(request, "request_id", ""),
        )
        return Response(DocumentSerializer(doc).data)
