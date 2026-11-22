from django.db.models import Q
from .models import Patient, DuplicateCandidate
from apps.common.exceptions import NotFoundError, PermissionDeniedError

def get_patient_by_public_id(user, public_id):
    patient = Patient.objects.filter(public_id=public_id).prefetch_related("identifiers").first()
    if not patient:
        raise NotFoundError("Patient not found.")

    # Check permission per SECURITY §4
    if hasattr(user, "patient_account") and user.patient_account.patient != patient:
        # Patient can only access own record
        raise NotFoundError("Patient not found.")  # 404 to avoid leaking existence

    return patient


def search_patients(user, query_str=None):
    if hasattr(user, "patient_account"):
        # Patients only see themselves
        return Patient.objects.filter(id=user.patient_account.patient.id)

    queryset = Patient.objects.prefetch_related("identifiers").all()
    if query_str:
        queryset = queryset.filter(
            Q(phone__icontains=query_str) |
            Q(given_name__icontains=query_str) |
            Q(family_name__icontains=query_str) |
            Q(name_bn__icontains=query_str) |
            Q(identifiers__value__icontains=query_str)
        )
    return queryset.distinct()


def get_duplicate_candidates_for_patient(patient):
    return DuplicateCandidate.objects.filter(
        Q(patient_a=patient) | Q(patient_b=patient)
    ).select_related("patient_a", "patient_b", "resolved_by")

