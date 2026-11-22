from django.db import transaction
from django.utils import timezone
from .models import Patient, PatientIdentifier, DuplicateCandidate
from apps.directory.models import Area
from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, ValidationError

def create_patient_record(user, validated_data, request_id="") -> Patient:
    with transaction.atomic():
        area = None
        area_id = validated_data.get("area_id")
        if area_id:
            area = Area.objects.filter(public_id=area_id).first()

        patient = Patient.objects.create(
            given_name=validated_data["given_name"],
            family_name=validated_data.get("family_name", ""),
            name_bn=validated_data.get("name_bn", ""),
            birth_date=validated_data.get("birth_date"),
            estimated_age=validated_data.get("estimated_age"),
            sex=validated_data.get("sex", "unknown"),
            phone=validated_data.get("phone"),
            area=area,
        )

        # Create identifiers
        for ident in validated_data.get("identifiers", []):
            PatientIdentifier.objects.create(
                patient=patient,
                system=ident["system"],
                value=ident["value"],
                verified=ident.get("verified", False),
            )

        # Check for potential duplicates (heuristic phone / NID match)
        check_potential_duplicates(patient)

        record_audit_event(
            action="create",
            object_type="patient",
            object_id=str(patient.public_id),
            actor_user=user,
            patient_id=str(patient.public_id),
            request_id=request_id,
        )
        return patient


def check_potential_duplicates(patient: Patient):
    """Simple duplicate detection rule to populate DuplicateCandidate."""
    if patient.phone:
        matches = Patient.objects.filter(phone=patient.phone).exclude(id=patient.id)
        for match in matches:
            DuplicateCandidate.objects.get_or_create(
                patient_a=match,
                patient_b=patient,
                defaults={
                    "score": 0.85,
                    "reasons": ["phone_match"],
                    "status": "open",
                },
            )


def resolve_duplicate_candidate(user, candidate_public_id, status: str, notes: str = "", request_id: str = ""):
    candidate = DuplicateCandidate.objects.filter(public_id=candidate_public_id).first()
    if not candidate:
        raise NotFoundError("Duplicate candidate record not found.")

    candidate.status = status
    candidate.resolved_by = user
    candidate.resolved_at = timezone.now()
    candidate.save()

    record_audit_event(
        action="update",
        object_type="duplicate_candidate",
        object_id=str(candidate.public_id),
        actor_user=user,
        patient_id=str(candidate.patient_a.public_id),
        reason=f"Resolved as {status}. Notes: {notes}",
        request_id=request_id,
    )
    return candidate
