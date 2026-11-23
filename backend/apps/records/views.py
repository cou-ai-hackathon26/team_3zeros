from rest_framework import views, permissions, status
from rest_framework.response import Response
from .models import Encounter, ClinicalObservation
from .serializers import (
    EncounterSerializer,
    EncounterCreateSerializer,
    ClinicalObservationSerializer,
    ObservationCreateSerializer,
)
from apps.identity.selectors import get_patient_by_public_id
from apps.organizations.models import Facility, Practitioner
from apps.common.exceptions import NotFoundError
from apps.common.pagination import CursorPagination
from apps.audit.services import record_audit_event

class PatientChartView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient = get_patient_by_public_id(request.user, patient_id)
        encounters = Encounter.objects.filter(patient=patient).prefetch_related("observations")
        record_audit_event(
            action="read",
            object_type="patient_chart",
            object_id=str(patient.public_id),
            actor_user=request.user,
            patient_id=str(patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        from apps.documents.selectors import list_patient_documents
        from apps.documents.serializers import DocumentSerializer

        documents = list_patient_documents(patient)
        return Response({
            "patient_id": str(patient.public_id),
            "encounters": EncounterSerializer(encounters, many=True).data,
            "documents": DocumentSerializer(documents, many=True).data,
        })


class PatientEncounterListCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        patient = get_patient_by_public_id(request.user, patient_id)
        encounters = Encounter.objects.filter(patient=patient)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(encounters, request)
        serializer = EncounterSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, patient_id):
        patient = get_patient_by_public_id(request.user, patient_id)
        serializer = EncounterCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        facility = Facility.objects.filter(public_id=serializer.validated_data["facility_id"]).first()
        if not facility:
            raise NotFoundError("Facility not found.")

        practitioner = None
        if serializer.validated_data.get("practitioner_id"):
            practitioner = Practitioner.objects.filter(public_id=serializer.validated_data["practitioner_id"]).first()

        encounter = Encounter.objects.create(
            patient=patient,
            facility=facility,
            practitioner=practitioner,
            period_start=serializer.validated_data["period_start"],
            period_end=serializer.validated_data.get("period_end"),
            encounter_type=serializer.validated_data["encounter_type"],
            reason=serializer.validated_data.get("reason", ""),
        )
        record_audit_event(
            action="create",
            object_type="encounter",
            object_id=str(encounter.public_id),
            actor_user=request.user,
            patient_id=str(patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(EncounterSerializer(encounter).data, status=status.HTTP_201_CREATED)


class EncounterDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        encounter = Encounter.objects.filter(public_id=public_id).first()
        if not encounter:
            raise NotFoundError("Encounter not found.")
        # Ensure permission to patient
        get_patient_by_public_id(request.user, encounter.patient.public_id)
        return Response(EncounterSerializer(encounter).data)

    def patch(self, request, public_id):
        encounter = Encounter.objects.filter(public_id=public_id).first()
        if not encounter:
            raise NotFoundError("Encounter not found.")
        get_patient_by_public_id(request.user, encounter.patient.public_id)
        if "reason" in request.data:
            encounter.reason = str(request.data["reason"])
        if "period_end" in request.data:
            encounter.period_end = request.data["period_end"]
        encounter.save()
        record_audit_event(
            action="update",
            object_type="encounter",
            object_id=str(encounter.public_id),
            actor_user=request.user,
            patient_id=str(encounter.patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(EncounterSerializer(encounter).data)


class EncounterObservationCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        encounter = Encounter.objects.filter(public_id=public_id).first()
        if not encounter:
            raise NotFoundError("Encounter not found.")
        get_patient_by_public_id(request.user, encounter.patient.public_id)

        serializer = ObservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        observation = ClinicalObservation.objects.create(
            encounter=encounter,
            patient=encounter.patient,
            code=serializer.validated_data["code"],
            display_name=serializer.validated_data["display_name"],
            value_string=serializer.validated_data.get("value_string", ""),
            value_numeric=serializer.validated_data.get("value_numeric"),
            unit=serializer.validated_data.get("unit", ""),
            observed_date=serializer.validated_data.get("observed_date"),
        )
        record_audit_event(
            action="create",
            object_type="observation",
            object_id=str(observation.public_id),
            actor_user=request.user,
            patient_id=str(encounter.patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )
        return Response(ClinicalObservationSerializer(observation).data, status=status.HTTP_201_CREATED)


