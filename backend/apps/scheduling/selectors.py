from django.db.models import Q
from apps.accounts.selectors import active_memberships
from .models import Slot, Appointment
from apps.common.exceptions import NotFoundError

def list_practitioner_slots(practitioner_id, facility_id=None, from_date=None, to_date=None, available_only=True):
    queryset = Slot.objects.select_related("schedule__practitioner_role__practitioner", "schedule__practitioner_role__facility").filter(
        schedule__practitioner_role__practitioner__public_id=practitioner_id
    )
    if facility_id:
        queryset = queryset.filter(schedule__practitioner_role__facility__public_id=facility_id)
    if from_date:
        queryset = queryset.filter(start__gte=from_date)
    if to_date:
        queryset = queryset.filter(end__lte=to_date)
    if available_only:
        queryset = queryset.filter(state="AVAILABLE")
    return queryset


def list_appointments(user, state=None, role_view=None):
    queryset = Appointment.objects.select_related("patient", "practitioner", "facility", "slot", "original_slot").all()

    if hasattr(user, "patient_account"):
        # Patients only see their own appointments
        queryset = queryset.filter(patient=user.patient_account.patient)
    else:
        # Clinicians and facility staff scoped to their facility
        facility_ids = active_memberships(user).values_list("facility_id", flat=True)
        queryset = queryset.filter(facility_id__in=facility_ids)
        if role_view == "clinician":
            if hasattr(user, "practitioner_profile"):
                queryset = queryset.filter(practitioner=user.practitioner_profile)

    if state:
        queryset = queryset.filter(state=state)
    return queryset


def get_appointment_by_public_id(user, appointment_id):
    appointment = Appointment.objects.select_related("patient", "practitioner", "facility", "slot", "original_slot").filter(
        public_id=appointment_id
    ).first()
    if not appointment:
        raise NotFoundError("Appointment not found.")

    # Permissions check
    if hasattr(user, "patient_account"):
        if appointment.patient != user.patient_account.patient:
            raise NotFoundError("Appointment not found.")
    else:  # platform admins have no default access to clinical data (MASTERPLAN §4.2)
        user_facility_ids = active_memberships(user).values_list("facility_id", flat=True)
        if appointment.facility_id not in user_facility_ids:
            raise NotFoundError("Appointment not found.")

    return appointment

