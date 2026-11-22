from django.db.models import Q
from .models import Referral
from apps.common.exceptions import NotFoundError, PermissionDeniedError

def list_referrals(user, direction=None, state=None):
    queryset = Referral.objects.select_related(
        "patient",
        "sender_facility",
        "sender_practitioner",
        "receiver_facility",
        "receiver_practitioner",
        "consent",
    ).all()

    if hasattr(user, "patient_account"):
        # Patients only see their own referrals
        queryset = queryset.filter(patient=user.patient_account.patient)
    else:
        user_facility_ids = user.memberships.values_list("facility_id", flat=True)
        if direction == "incoming":
            queryset = queryset.filter(receiver_facility_id__in=user_facility_ids)
        elif direction == "outgoing":
            queryset = queryset.filter(sender_facility_id__in=user_facility_ids)
        else:
            queryset = queryset.filter(
                Q(sender_facility_id__in=user_facility_ids) | Q(receiver_facility_id__in=user_facility_ids)
            )

    if state:
        queryset = queryset.filter(state=state)
    return queryset


def get_referral_by_public_id(user, public_id):
    referral = Referral.objects.select_related(
        "patient",
        "sender_facility",
        "sender_practitioner",
        "receiver_facility",
        "receiver_practitioner",
        "consent",
    ).filter(public_id=public_id).first()
    if not referral:
        raise NotFoundError("Referral not found.")

    # Permissions check per SECURITY §4
    if hasattr(user, "patient_account"):
        if referral.patient != user.patient_account.patient:
            raise NotFoundError("Referral not found.")
    elif not hasattr(user, "platform_admin"):
        user_facility_ids = user.memberships.values_list("facility_id", flat=True)
        if referral.sender_facility_id not in user_facility_ids and referral.receiver_facility_id not in user_facility_ids:
            raise NotFoundError("Referral not found.")

    return referral


def get_referral_by_code(user, code):
    referral = Referral.objects.select_related(
        "patient",
        "sender_facility",
        "sender_practitioner",
        "receiver_facility",
        "receiver_practitioner",
    ).filter(Q(reference_code=code) | Q(provisional_code=code)).first()
    if not referral:
        raise NotFoundError("Referral not found.")

    if not hasattr(user, "platform_admin"):
        user_facility_ids = user.memberships.values_list("facility_id", flat=True)
        if referral.receiver_facility_id not in user_facility_ids and referral.sender_facility_id not in user_facility_ids:
            raise NotFoundError("Referral not found.")

    return referral

