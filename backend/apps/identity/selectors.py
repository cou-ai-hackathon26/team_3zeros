from django.db.models import Q
from apps.accounts.selectors import active_memberships
from .models import Patient, DuplicateCandidate
from apps.common.exceptions import NotFoundError


def _has_clinical_staff_access(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return active_memberships(user).filter(role__in=["clinician", "facility_staff"]).exists()


def get_patient_by_public_id(user, public_id):
    patient = Patient.objects.filter(public_id=public_id).prefetch_related("identifiers").first()
    if not patient:
        raise NotFoundError("Patient not found.")

    # Check permission per SECURITY §4 / MASTERPLAN §4.2
    if hasattr(user, "patient_account"):
        if user.patient_account.patient != patient:
            raise NotFoundError("Patient not found.")  # 404 to avoid leaking existence
        return patient

    if not _has_clinical_staff_access(user):
        raise NotFoundError("Patient not found.")

    return patient


def search_patients(user, query_str=None):
    if hasattr(user, "patient_account"):
        # Patients only see themselves
        return Patient.objects.prefetch_related("identifiers").filter(id=user.patient_account.patient.id)

    if not _has_clinical_staff_access(user):
        return Patient.objects.none()

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
