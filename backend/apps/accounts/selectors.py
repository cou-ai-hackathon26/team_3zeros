from typing import List, Optional
from .models import User, Membership

def get_user_memberships(user: User):
    if not user or not user.is_authenticated:
        return Membership.objects.none()
    return user.memberships.select_related("facility").all()

def get_user_roles(user: User) -> List[str]:
    if not user or not user.is_authenticated:
        return []
    roles = set()
    if hasattr(user, "patient_account"):
        roles.add("patient")
    for m in user.memberships.all():
        roles.add(m.role)
    if hasattr(user, "platform_admin"):
        roles.add("platform_admin")
    return sorted(list(roles))

def get_user_permissions(user: User, active_facility_id: Optional[str] = None) -> List[str]:
    if not user or not user.is_authenticated:
        return []
    perms = set()
    memberships = user.memberships.all()
    if active_facility_id:
        memberships = memberships.filter(facility__public_id=active_facility_id)
    for m in memberships:
        for p in (m.permissions or []):
            perms.add(p)
    return sorted(list(perms))

