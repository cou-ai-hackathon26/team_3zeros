from django.db.models import Q
from apps.accounts.selectors import active_memberships
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
        user_facility_ids = active_memberships(user).values_list("facility_id", flat=True)
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
    else:  # platform admins have no default access to clinical data (MASTERPLAN §4.2); only active memberships count
        user_facility_ids = active_memberships(user).values_list("facility_id", flat=True)
        if referral.sender_facility_id not in user_facility_ids and referral.receiver_facility_id not in user_facility_ids:
            raise NotFoundError("Referral not found.")

    return referral


def get_referral_by_code(user, code):
    normalized = (code or "").strip()
    if normalized.upper().startswith("MW-REF:"):
        normalized = normalized[7:].strip()
    if not normalized:
        raise NotFoundError("Referral not found.")

    referral = Referral.objects.select_related(
        "patient",
        "sender_facility",
        "sender_practitioner",
        "receiver_facility",
        "receiver_practitioner",
    ).filter(Q(reference_code=normalized) | Q(provisional_code=normalized)).first()
    if not referral:
        raise NotFoundError("Referral not found.")

    user_facility_ids = set(active_memberships(user).values_list("facility_id", flat=True))
    in_receiver = referral.receiver_facility_id in user_facility_ids
    in_sender = referral.sender_facility_id is not None and referral.sender_facility_id in user_facility_ids
    if not (in_receiver or in_sender):
        raise NotFoundError("Referral not found.")

    return referral

