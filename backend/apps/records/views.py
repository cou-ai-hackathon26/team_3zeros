from django.utils import timezone
from rest_framework import views, permissions, status
from rest_framework.response import Response
from .models import Encounter, ClinicalObservation, ClinicalOrder
from .serializers import (
    EncounterSerializer,
    EncounterCreateSerializer,
    ClinicalObservationSerializer,
    ObservationCreateSerializer,
    ClinicalOrderSerializer,
    ClinicalOrderCreateSerializer,
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

        all_obs = ClinicalObservation.objects.filter(patient=patient).select_related("encounter", "encounter__facility").order_by("-observed_date")
        active_allergies = []
        active_medications = []
        for o in all_obs:
            code_lower = o.code.lower()
            name_lower = o.display_name.lower()
            val = o.value_string or (f"{o.value_numeric} {o.unit}".strip() if o.value_numeric is not None else "")
            if "allergy" in code_lower or "allergy" in name_lower:
                active_allergies.append({
                    "id": str(o.public_id),
                    "name": o.display_name,
                    "reaction": o.value_string or "Reported allergy",
                    "observed_date": o.observed_date.isoformat() if o.observed_date else None,
                })
            elif "med" in code_lower or "rx" in code_lower or "drug" in name_lower or "tablet" in name_lower:
                active_medications.append({
                    "id": str(o.public_id),
                    "name": o.display_name,
                    "dosage": val,
                    "observed_date": o.observed_date.isoformat() if o.observed_date else None,
                })

        active_problems = []
        seen_problems = set()
        for enc in encounters:
            if enc.reason and enc.reason not in seen_problems:
                seen_problems.add(enc.reason)
                active_problems.append({
                    "encounter_id": str(enc.public_id),
                    "reason": enc.reason,
                    "period_start": enc.period_start.isoformat(),
                })

        return Response({
            "patient_id": str(patient.public_id),
            "encounters": EncounterSerializer(encounters, many=True).data,
            "active_allergies": active_allergies,
            "active_medications": active_medications,
            "active_problems": active_problems,
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


class EncounterOrderListCreateView(views.APIView):
    """
    Diagnostic investigation orders (MASTERPLAN §6.3, INV-15).
    Evaluates prior verified results for duplicate advisory without suppressing the order.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        encounter = Encounter.objects.filter(public_id=public_id).first()
        if not encounter:
            raise NotFoundError("Encounter not found.")
        get_patient_by_public_id(request.user, encounter.patient.public_id)
        orders = ClinicalOrder.objects.filter(encounter=encounter)
        return Response({"orders": ClinicalOrderSerializer(orders, many=True).data})

    def post(self, request, public_id):
        encounter = Encounter.objects.filter(public_id=public_id).first()
        if not encounter:
            raise NotFoundError("Encounter not found.")
        patient = get_patient_by_public_id(request.user, encounter.patient.public_id)

        serializer = ClinicalOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        test_name = serializer.validated_data["test_name"].strip()
        code = serializer.validated_data.get("code", "").strip()

        # Check for recent verified results (INV-15: advisory only, never auto-cancelled)
        matching_obs = ClinicalObservation.objects.filter(patient=patient).select_related("encounter", "encounter__facility")
        if code:
            obs_matches = matching_obs.filter(code__iexact=code)
        else:
            obs_matches = matching_obs.filter(display_name__icontains=test_name)

        now = timezone.now()
        recent_results = []
        for obs in obs_matches[:5]:
            obs_time = obs.observed_date or obs.created_at
            days_ago = max(0, (now - obs_time).days)
            fac_name = obs.encounter.facility.name if obs.encounter and obs.encounter.facility else "Unknown facility"
            val = obs.value_string or (str(obs.value_numeric) if obs.value_numeric is not None else "")
            recent_results.append({
                "id": str(obs.public_id),
                "test_name": obs.display_name,
                "code": obs.code,
                "value": f"{val} {obs.unit}".strip(),
                "unit": obs.unit,
                "observed_date": obs_time.isoformat(),
                "days_ago": days_ago,
                "facility_name": fac_name,
                "verified": True,
            })

        order = ClinicalOrder.objects.create(
            encounter=encounter,
            patient=patient,
            test_name=test_name,
            code=code,
            notes=serializer.validated_data.get("notes", ""),
            priority=serializer.validated_data.get("priority", "ROUTINE"),
            ordered_by=request.user,
        )

        advisory = None
        if recent_results:
            top = recent_results[0]
            advisory = (
                f"Recent result available: {top['test_name']} was performed {top['days_ago']} day(s) ago "
                f"at {top['facility_name']} (Result: {top['value']}). "
                f"Test ordered as requested; duplicate tests are never cancelled automatically (INV-15)."
            )

        record_audit_event(
            action="create",
            object_type="clinical_order",
            object_id=str(order.public_id),
            actor_user=request.user,
            patient_id=str(patient.public_id),
            request_id=getattr(request, "request_id", ""),
        )

        return Response(
            {
                "order": ClinicalOrderSerializer(order).data,
                "recent_results": recent_results,
                "advisory": advisory,
            },
            status=status.HTTP_201_CREATED,
        )


