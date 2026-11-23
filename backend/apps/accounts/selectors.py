from typing import List, Optional
from django.db.models import Q
from django.utils import timezone
from .models import User, Membership

def get_user_memberships(user: User):
    if not user or not user.is_authenticated:
        return Membership.objects.none()
    return user.memberships.select_related("facility").all()

def active_memberships(user: User):
    """Memberships that have started and not ended. Expired or deactivated ones grant nothing."""
    now = timezone.now()
    return user.memberships.filter(Q(active_to__isnull=True) | Q(active_to__gt=now))


def is_admin_user(user: User) -> bool:
    return hasattr(user, "platform_admin") or active_memberships(user).filter(role="facility_admin").exists()


def get_user_roles(user: User) -> List[str]:
    if not user or not user.is_authenticated:
        return []
    roles = set()
    if hasattr(user, "patient_account"):
        roles.add("patient")
    for m in active_memberships(user):
        roles.add(m.role)
    if hasattr(user, "platform_admin"):
        roles.add("platform_admin")
    return sorted(list(roles))

def get_user_permissions(user: User, active_facility_id: Optional[str] = None) -> List[str]:
    if not user or not user.is_authenticated:
        return []
    perms = set()
    memberships = active_memberships(user)
    if active_facility_id:
        memberships = memberships.filter(facility__public_id=active_facility_id)
    for m in memberships:
        for p in (m.permissions or []):
            perms.add(p)
    return sorted(list(perms))

