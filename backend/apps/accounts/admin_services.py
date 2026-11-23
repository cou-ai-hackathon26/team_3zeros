"""Staff access control for admins (MASTERPLAN D-16): create, change, deactivate, reset, revoke. Every action is audited."""
import secrets

from django.contrib.sessions.models import Session
from django.db import transaction
from django.utils import timezone

from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from apps.organizations.models import Facility, Practitioner

from . import security
from .catalogue import PERMISSION_CODES, STAFF_ROLES
from .models import Membership, User
from .selectors import active_memberships


def _is_platform(actor: User) -> bool:
    return hasattr(actor, "platform_admin") or actor.is_superuser


def actor_facility(actor: User):
    """None for a platform admin (all facilities); the facility for a facility admin; otherwise forbidden."""
    if _is_platform(actor):
        return None
    m = active_memberships(actor).filter(role="facility_admin").select_related("facility").first()
    if not m:
        raise PermissionDeniedError("Facility admin or platform admin role is required.")
    return m.facility


def require_admin(actor: User):
    return actor_facility(actor)


def _audit(actor, membership_or_none, reason, request, outcome="success", action="update", object_id=None):
    record_audit_event(
        action=action,
        object_type="membership",
        object_id=object_id or (str(membership_or_none.public_id) if membership_or_none else ""),
        actor_user=actor,
        actor_role="platform_admin" if _is_platform(actor) else "facility_admin",
        reason=reason,
        outcome=outcome,
        request_id=getattr(request, "request_id", ""),
    )


def _clean_permissions(permissions):
    permissions = list(permissions or [])
    unknown = [p for p in permissions if p not in PERMISSION_CODES]
    if unknown:
        raise ValidationError(f"Unknown permission: {', '.join(unknown)}.", field_errors={"permissions": ["Not in the permission catalogue."]})
    return [p for p in PERMISSION_CODES if p in permissions]  # catalogue order, no duplicates


def _check_role_grant(actor, role, facility):
    if role not in STAFF_ROLES:
        raise ValidationError("Unknown role.", field_errors={"role": ["Choose clinician, facility staff or facility admin."]})
    scope = actor_facility(actor)
    if scope is not None and facility.pk != scope.pk:
        raise PermissionDeniedError("You can manage staff in your own facility only.")
    if role == "facility_admin" and not _is_platform(actor):
        raise PermissionDeniedError("Only a platform admin can create a facility admin.")


def get_membership(actor: User, public_id) -> Membership:
    """A membership the actor may manage. Outside the actor's facility it does not exist, as far as they can tell."""
    scope = actor_facility(actor)
    m = Membership.objects.select_related("user", "facility").filter(public_id=public_id).first()
    if not m or (scope is not None and m.facility_id != scope.pk):
        raise NotFoundError("Staff membership not found.")
    return m


def _guard_target(actor: User, m: Membership, *, allow_self=False):
    if m.user_id == actor.pk and not allow_self:
        raise PermissionDeniedError("You cannot change your own access here.")
    if not _is_platform(actor) and (hasattr(m.user, "platform_admin") or m.role == "facility_admin"):
        raise PermissionDeniedError("Only a platform admin can change an admin.")


def revoke_user_sessions(user: User) -> int:
    n = 0
    for s in Session.objects.filter(expire_date__gte=timezone.now()):
        if s.get_decoded().get("_auth_user_id") == str(user.pk):
            s.delete()
            n += 1
    return n


def _temporary_password() -> str:
    return secrets.token_urlsafe(12)


def _enrol_mfa(user: User) -> str:
    user.mfa_secret = security.new_totp_secret()
    user.mfa_enabled = True
    user.save(update_fields=["mfa_secret", "mfa_enabled"])
    return security.totp_uri(user.mfa_secret, user.email or user.username or str(user.public_id))


@transaction.atomic
def create_staff(actor: User, data: dict, request=None) -> dict:
    facility = Facility.objects.filter(public_id=data["facility_id"]).first()
    if not facility:
        raise NotFoundError("Facility not found.")
    role = data["role"]
    _check_role_grant(actor, role, facility)
    permissions = _clean_permissions(data.get("permissions"))
    email, username, phone = (data.get("email") or None), (data.get("username") or None), (data.get("phone") or None)
    if not email and not username:
        raise ValidationError("An email or username is required.", field_errors={"email": ["Provide an email or a username."]})
    registration = (data.get("registration_number") or "").strip()
    if role == "clinician" and not registration:
        raise ValidationError("A BMDC registration number is required for a clinician.", field_errors={"registration_number": ["Required for a clinician."]})

    user = (User.objects.filter(email__iexact=email).first() if email else None) or (User.objects.filter(username__iexact=username).first() if username else None)
    result = {}
    if user is None:
        temp = _temporary_password()
        user = User.objects.create_user(email=email, username=username, phone=phone, password=temp, display_name=data.get("display_name", ""))
        result["temporary_password"] = temp
    elif Membership.objects.filter(user=user, facility=facility, role=role).exists():
        raise ValidationError("This person already has that role in this facility.")
    if role == "facility_admin" and not (user.mfa_enabled and user.mfa_secret):
        result["totp_uri"] = _enrol_mfa(user)

    membership = Membership.objects.create(user=user, facility=facility, role=role, permissions=permissions)
    if role == "clinician" and not Practitioner.objects.filter(user=user).exists():
        Practitioner.objects.create(user=user, name=user.display_name or email or username, registration_number=registration)
    _audit(actor, membership, f"create {role} with {permissions}", request, action="create")
    result["membership"] = membership
    return result


@transaction.atomic
def update_staff(actor: User, m: Membership, data: dict, request=None) -> Membership:
    _guard_target(actor, m)
    changes = []
    if "role" in data and data["role"] != m.role:
        _check_role_grant(actor, data["role"], m.facility)
        changes.append(f"role {m.role} -> {data['role']}")
        m.role = data["role"]
    if "permissions" in data:
        new = _clean_permissions(data["permissions"])
        changes.append(f"permissions {m.permissions} -> {new}")
        m.permissions = new
    m.save()
    _audit(actor, m, "update " + "; ".join(changes or ["no change"]), request)
    return m


def _other_active_platform_admins(user: User) -> int:
    from .models import PlatformAdmin
    return PlatformAdmin.objects.filter(user__is_active=True).exclude(user=user).count()


@transaction.atomic
def deactivate_staff(actor: User, m: Membership, request=None) -> Membership:
    _guard_target(actor, m)
    if hasattr(m.user, "platform_admin") and _other_active_platform_admins(m.user) == 0:
        raise PermissionDeniedError("The last platform admin cannot be deactivated.")
    m.active_to = timezone.now()
    m.save(update_fields=["active_to"])
    # The account stays usable only if something else still grants it access.
    if not active_memberships(m.user).exists() and not hasattr(m.user, "platform_admin") and not hasattr(m.user, "patient_account"):
        m.user.is_active = False
        m.user.save(update_fields=["is_active"])
    revoke_user_sessions(m.user)
    _audit(actor, m, "deactivate", request)
    return m


@transaction.atomic
def reactivate_staff(actor: User, m: Membership, request=None) -> Membership:
    _guard_target(actor, m)
    m.active_to = None
    m.save(update_fields=["active_to"])
    if not m.user.is_active:
        m.user.is_active = True
        m.user.save(update_fields=["is_active"])
    _audit(actor, m, "reactivate", request)
    return m


@transaction.atomic
def reset_password(actor: User, m: Membership, request=None) -> str:
    _guard_target(actor, m)
    temp = _temporary_password()
    m.user.set_password(temp)
    m.user.save(update_fields=["password"])
    revoke_user_sessions(m.user)
    _audit(actor, m, "reset-password", request)
    return temp


@transaction.atomic
def reset_mfa(actor: User, m: Membership, request=None) -> str:
    _guard_target(actor, m)
    uri = _enrol_mfa(m.user)
    revoke_user_sessions(m.user)
    _audit(actor, m, "reset-mfa", request)
    return uri


def revoke_sessions(actor: User, m: Membership, request=None) -> int:
    _guard_target(actor, m)
    n = revoke_user_sessions(m.user)
    _audit(actor, m, f"revoke-sessions ({n})", request)
    return n


def membership_row(m: Membership) -> dict:
    now = timezone.now()
    return {
        "id": str(m.public_id),
        "user_id": str(m.user.public_id),
        "name": m.user.display_name or m.user.username or m.user.email,
        "email": m.user.email,
        "username": m.user.username,
        "phone": m.user.phone,
        "facility_id": str(m.facility.public_id),
        "facility_name": m.facility.name,
        "role": m.role,
        "permissions": m.permissions,
        "active": m.user.is_active and (m.active_to is None or m.active_to > now),
        "active_from": m.active_from.isoformat() if m.active_from else None,
        "active_to": m.active_to.isoformat() if m.active_to else None,
        "mfa_enabled": m.user.mfa_enabled,
    }
