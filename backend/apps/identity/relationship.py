"""Care relationship (SECURITY §4.3, INV-9): why a clinician may act for a patient at a facility.

A relationship exists when the patient has an appointment (not declined, cancelled or expired), an encounter, or a
referral involving one of the given facilities. A role alone never grants access to a patient."""
from typing import Iterable

INACTIVE_APPOINTMENT_STATES = ("DECLINED", "CANCELLED", "EXPIRED")


def has_care_relationship(patient, facility_ids: Iterable[int]) -> bool:
    from django.db.models import Q
    from apps.records.models import Encounter
    from apps.referrals.models import Referral
    from apps.scheduling.models import Appointment

    ids = list(facility_ids)
    if not ids:
        return False
    return (
        Appointment.objects.filter(patient=patient, facility_id__in=ids).exclude(state__in=INACTIVE_APPOINTMENT_STATES).exists()
        or Encounter.objects.filter(patient=patient, facility_id__in=ids).exists()
        or Referral.objects.filter(patient=patient).filter(Q(sender_facility_id__in=ids) | Q(receiver_facility_id__in=ids)).exists()
    )
