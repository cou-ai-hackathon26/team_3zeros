"""Admin access control (MASTERPLAN D-16, D-17): hardened sign-in, separate admin login, staff management."""
import pytest
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, PlatformAdmin, User
from apps.accounts.security import new_totp_secret, totp_code, verify_totp
from apps.audit.models import AuditEvent
from apps.organizations.models import Facility, Practitioner

PW = "Passw0rd!long-enough"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


@pytest.fixture
def facilities(db):
    return Facility.objects.create(name="Savar UHC"), Facility.objects.create(name="Dhaka MC")


def mkuser(email, **kw):
    u = User.objects.create_user(email=email, password=PW, display_name=email.split("@")[0], **kw)
    return u


def mk_admin(email, facility=None, platform=False):
    secret = new_totp_secret()
    u = mkuser(email, mfa_enabled=True)
    u.mfa_secret = secret
    u.save()
    if platform:
        PlatformAdmin.objects.create(user=u)
    else:
        Membership.objects.create(user=u, facility=facility, role="facility_admin", permissions=[])
    return u, secret


def admin_login(client, user, secret):
    r = client.post("/api/v1/auth/admin/login", {"email": user.email, "password": PW}, format="json")
    assert r.status_code == 401 and r.data["error"]["code"] == "mfa_required", r.data
    r = client.post("/api/v1/auth/mfa/verify", {"code": totp_code(secret)}, format="json")
    assert r.status_code == 200, r.data


def client_for(user, secret):
    c = APIClient()
    admin_login(c, user, secret)
    return c


class TestTotp:
    def test_code_round_trip_and_rejects_others(self):
        s = new_totp_secret()
        assert verify_totp(s, totp_code(s))
        assert not verify_totp(s, "000000") or totp_code(s) == "000000"
        assert not verify_totp(new_totp_secret(), totp_code(s))

    def test_matches_rfc6238_vector(self):
        # RFC 6238 appendix B, SHA1, secret "12345678901234567890", T=59 -> 94287082 (8 digits)
        import base64
        secret = base64.b32encode(b"12345678901234567890").decode()
        assert totp_code(secret, at=59, digits=8) == "94287082"


class TestSignInHardening:
    def test_wrong_password_is_rate_limited_after_five_tries(self, facilities):
        u = mkuser("dr@example.org")
        Membership.objects.create(user=u, facility=facilities[0], role="clinician")
        c = APIClient()
        for _ in range(5):
            assert c.post("/api/v1/auth/login", {"email": "dr@example.org", "password": "bad"}, format="json").status_code == 401
        r = c.post("/api/v1/auth/login", {"email": "dr@example.org", "password": PW}, format="json")
        assert r.status_code == 429 and r.data["error"]["code"] == "rate_limited"

    def test_registration_checks_password_strength_and_rejects_clashes_with_one_message(self, db):
        c = APIClient()
        weak = c.post("/api/v1/auth/register", {"email": "a@example.org", "display_name": "A", "password": "short"}, format="json")
        assert weak.status_code == 400 and "password" in (weak.data["error"].get("field_errors") or {})
        ok = {"email": "b@example.org", "username": "bee", "display_name": "B", "password": "a-long-passphrase-9"}
        assert c.post("/api/v1/auth/register", ok, format="json").status_code == 201
        same_email = APIClient().post("/api/v1/auth/register", {**ok, "username": "other"}, format="json")
        same_user = APIClient().post("/api/v1/auth/register", {**ok, "email": "c@example.org"}, format="json")
        assert same_email.status_code == same_user.status_code == 400
        assert same_email.data["error"]["message"] == same_user.data["error"]["message"]

    def test_registration_is_rate_limited_per_client(self, db):
        c = APIClient()
        for i in range(5):
            c.post("/api/v1/auth/register", {"email": f"r{i}@example.org", "display_name": "R", "password": "a-long-passphrase-9"}, format="json")
        r = c.post("/api/v1/auth/register", {"email": "r9@example.org", "display_name": "R", "password": "a-long-passphrase-9"}, format="json")
        assert r.status_code == 429

    def test_sign_in_by_username_and_the_old_phone_identifier_no_longer_works(self, db):
        User.objects.create_user(email="u@example.org", username="uzer", password=PW, phone="+8801700000077")
        assert APIClient().post("/api/v1/auth/login", {"username": "uzer", "password": PW}, format="json").status_code == 200
        assert APIClient().post("/api/v1/auth/login", {"phone": "+8801700000077", "password": PW}, format="json").status_code == 401

    def test_expired_memberships_grant_no_role(self, facilities):
        u = mkuser("old@example.org")
        Membership.objects.create(user=u, facility=facilities[0], role="clinician", active_to=timezone.now() - timezone.timedelta(days=1))
        from apps.accounts.selectors import get_user_roles
        assert get_user_roles(u) == []


class TestAdminLogin:
    def test_admin_signs_in_only_with_mfa_and_staff_login_refuses_admins(self, facilities):
        u, secret = mk_admin("fa@example.org", facilities[0])
        c = APIClient()
        # the ordinary staff endpoint answers exactly like a wrong password
        r = c.post("/api/v1/auth/login", {"email": u.email, "password": PW}, format="json")
        assert r.status_code == 401 and r.data["error"]["code"] == "not_authenticated"
        admin_login(c, u, secret)
        me = c.get("/api/v1/auth/me").data
        assert "facility_admin" in me["roles"]

    def test_non_admin_cannot_use_admin_login_and_gets_the_same_error(self, facilities):
        u = mkuser("dr@example.org", mfa_enabled=False)
        Membership.objects.create(user=u, facility=facilities[0], role="clinician")
        wrong = APIClient().post("/api/v1/auth/admin/login", {"email": "nobody@example.org", "password": "x"}, format="json")
        r = APIClient().post("/api/v1/auth/admin/login", {"email": u.email, "password": PW}, format="json")
        assert r.status_code == wrong.status_code == 401
        assert r.data["error"]["code"] == wrong.data["error"]["code"] == "not_authenticated"
        assert r.data["error"]["message"] == wrong.data["error"]["message"]

    def test_admin_without_enrolled_mfa_cannot_sign_in(self, facilities):
        u = mkuser("fa2@example.org")
        Membership.objects.create(user=u, facility=facilities[0], role="facility_admin")
        r = APIClient().post("/api/v1/auth/admin/login", {"email": u.email, "password": PW}, format="json")
        assert r.status_code == 401 and r.data["error"]["code"] == "not_authenticated"

    def test_wrong_mfa_code_is_rejected_and_locks_after_five(self, facilities):
        u, secret = mk_admin("fa3@example.org", facilities[0])
        c = APIClient()
        c.post("/api/v1/auth/admin/login", {"email": u.email, "password": PW}, format="json")
        bad = "000000" if totp_code(secret) != "000000" else "111111"
        for _ in range(5):
            assert c.post("/api/v1/auth/mfa/verify", {"code": bad}, format="json").status_code == 400
        assert c.post("/api/v1/auth/mfa/verify", {"code": totp_code(secret)}, format="json").status_code == 429

    def test_staff_and_admin_sessions_are_short(self, facilities):
        u, secret = mk_admin("fa4@example.org", facilities[0])
        c = client_for(u, secret)
        s = Session.objects.get(session_key=c.cookies["sessionid"].value)
        assert (s.expire_date - timezone.now()).total_seconds() <= 900 + 5


class TestStaffManagement:
    def post(self, c, path, body=None):
        return c.post(f"/api/v1/admin/{path}", body or {}, format="json")

    def test_permission_catalogue_is_served_and_closed(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        r = client_for(u, s).get("/api/v1/admin/permissions")
        assert r.status_code == 200
        assert [p["code"] for p in r.data["results"]] == ["schedule.manage", "referral.acknowledge", "referral.create", "emergency.create"]

    def test_facility_admin_creates_staff_in_own_facility_and_the_password_is_shown_once(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        r = self.post(c, "staff", {"email": "new@example.org", "display_name": "New Staff", "role": "facility_staff", "facility_id": str(facilities[0].public_id), "permissions": ["schedule.manage"]})
        assert r.status_code == 201, r.data
        assert r.data["temporary_password"] and len(r.data["temporary_password"]) >= 12
        listed = c.get("/api/v1/admin/staff").data["results"]
        row = next(x for x in listed if x["email"] == "new@example.org")
        assert "temporary_password" not in row and row["permissions"] == ["schedule.manage"]
        # the new user can sign in with the temporary password through the staff endpoint
        assert APIClient().post("/api/v1/auth/login", {"email": "new@example.org", "password": r.data["temporary_password"]}, format="json").status_code == 200
        assert AuditEvent.objects.filter(object_type="membership", actor_user=u).exists()

    def test_clinician_needs_a_registration_number_and_gets_a_practitioner_profile(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        body = {"email": "dr@example.org", "display_name": "Dr. A", "role": "clinician", "facility_id": str(facilities[0].public_id), "permissions": []}
        assert self.post(c, "staff", body).status_code == 400
        assert self.post(c, "staff", {**body, "registration_number": "BMDC-A-1"}).status_code == 201
        assert Practitioner.objects.filter(registration_number="BMDC-A-1", user__email="dr@example.org").exists()

    def test_facility_admin_is_confined_to_own_facility_and_to_lower_roles(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        base = {"email": "x@example.org", "display_name": "X", "permissions": []}
        assert self.post(c, "staff", {**base, "role": "facility_staff", "facility_id": str(facilities[1].public_id)}).status_code == 403
        assert self.post(c, "staff", {**base, "role": "facility_admin", "facility_id": str(facilities[0].public_id)}).status_code == 403

    def test_platform_admin_may_create_a_facility_admin_anywhere(self, facilities):
        u, s = mk_admin("pa@example.org", platform=True)
        r = self.post(client_for(u, s), "staff", {"email": "fa@example.org", "display_name": "FA", "role": "facility_admin", "facility_id": str(facilities[1].public_id), "permissions": []})
        assert r.status_code == 201 and r.data["totp_uri"].startswith("otpauth://totp/")
        assert User.objects.get(email="fa@example.org").mfa_enabled

    def test_permissions_outside_the_catalogue_are_refused(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        r = self.post(client_for(u, s), "staff", {"email": "x@example.org", "display_name": "X", "role": "facility_staff", "facility_id": str(facilities[0].public_id), "permissions": ["referral.approve"]})
        assert r.status_code == 400

    def test_non_admins_get_403_on_every_admin_write(self, facilities):
        c_user = mkuser("dr@example.org")
        m = Membership.objects.create(user=c_user, facility=facilities[0], role="clinician")
        c = APIClient(); c.force_authenticate(c_user)
        assert c.get("/api/v1/admin/permissions").status_code == 403
        assert self.post(c, "staff", {}).status_code == 403
        assert self.post(c, f"staff/{m.public_id}/deactivate").status_code == 403
        assert c.patch(f"/api/v1/admin/staff/{m.public_id}", {"permissions": []}, format="json").status_code == 403

    def test_patch_changes_role_and_permissions_with_guards(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        t = mkuser("st@example.org")
        m = Membership.objects.create(user=t, facility=facilities[0], role="facility_staff", permissions=[])
        r = c.patch(f"/api/v1/admin/staff/{m.public_id}", {"permissions": ["schedule.manage", "emergency.create"]}, format="json")
        assert r.status_code == 200 and r.data["permissions"] == ["schedule.manage", "emergency.create"]
        assert c.patch(f"/api/v1/admin/staff/{m.public_id}", {"role": "facility_admin"}, format="json").status_code == 403
        other = Membership.objects.create(user=mkuser("o@example.org"), facility=facilities[1], role="facility_staff")
        assert c.patch(f"/api/v1/admin/staff/{other.public_id}", {"permissions": []}, format="json").status_code == 404

    def test_deactivate_blocks_access_at_once_and_reactivate_restores_it(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        t = mkuser("st@example.org")
        m = Membership.objects.create(user=t, facility=facilities[0], role="facility_staff")
        tc = APIClient(); assert tc.post("/api/v1/auth/login", {"email": t.email, "password": PW}, format="json").status_code == 200
        assert tc.get("/api/v1/auth/me").status_code == 200
        assert self.post(c, f"staff/{m.public_id}/deactivate").status_code == 200
        assert tc.get("/api/v1/auth/me").status_code in (401, 403)  # existing session is gone
        assert APIClient().post("/api/v1/auth/login", {"email": t.email, "password": PW}, format="json").status_code in (401, 403)
        assert self.post(c, f"staff/{m.public_id}/reactivate").status_code == 200
        assert APIClient().post("/api/v1/auth/login", {"email": t.email, "password": PW}, format="json").status_code == 200

    def test_nobody_can_lock_themselves_out(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        own = u.memberships.get()
        assert self.post(c, f"staff/{own.public_id}/deactivate").status_code == 403
        assert c.patch(f"/api/v1/admin/staff/{own.public_id}", {"permissions": []}, format="json").status_code == 403

    def test_only_a_platform_admin_may_touch_a_platform_admin(self, facilities):
        fa, fs = mk_admin("fa@example.org", facilities[0])
        pa, ps = mk_admin("pa@example.org", platform=True)
        pm = Membership.objects.create(user=pa, facility=facilities[0], role="facility_staff")
        assert self.post(client_for(fa, fs), f"staff/{pm.public_id}/deactivate").status_code == 403
        other, os_ = mk_admin("pa2@example.org", platform=True)
        assert self.post(client_for(other, os_), f"staff/{pm.public_id}/deactivate").status_code == 200

    def test_reset_password_revokes_sessions_and_changes_the_password_once(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        t = mkuser("st@example.org")
        m = Membership.objects.create(user=t, facility=facilities[0], role="facility_staff")
        tc = APIClient(); tc.post("/api/v1/auth/login", {"email": t.email, "password": PW}, format="json")
        r = self.post(c, f"staff/{m.public_id}/reset-password")
        assert r.status_code == 200 and r.data["temporary_password"]
        assert tc.get("/api/v1/auth/me").status_code in (401, 403)
        assert APIClient().post("/api/v1/auth/login", {"email": t.email, "password": PW}, format="json").status_code == 401
        assert APIClient().post("/api/v1/auth/login", {"email": t.email, "password": r.data["temporary_password"]}, format="json").status_code == 200

    def test_reset_mfa_and_revoke_sessions(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        t = mkuser("st@example.org")
        m = Membership.objects.create(user=t, facility=facilities[0], role="facility_staff")
        r = self.post(c, f"staff/{m.public_id}/reset-mfa")
        assert r.status_code == 200 and r.data["totp_uri"].startswith("otpauth://")
        t.refresh_from_db(); assert t.mfa_enabled and t.mfa_secret
        tc = APIClient(); tc.force_login(t)
        assert self.post(c, f"staff/{m.public_id}/revoke-sessions").status_code == 200

    def test_every_change_is_audited_with_actor_and_target(self, facilities):
        u, s = mk_admin("fa@example.org", facilities[0])
        c = client_for(u, s)
        m = Membership.objects.create(user=mkuser("st@example.org"), facility=facilities[0], role="facility_staff")
        before = AuditEvent.objects.filter(actor_user=u).count()
        self.post(c, f"staff/{m.public_id}/deactivate")
        ev = AuditEvent.objects.filter(actor_user=u, object_type="membership", object_id=str(m.public_id)).latest("at")
        assert "deactivate" in ev.reason and AuditEvent.objects.filter(actor_user=u).count() > before


class TestCreatePlatformAdminCommand:
    def test_creates_a_mfa_enrolled_platform_admin_and_prints_secrets_once(self, db, capsys):
        call_command("create_platform_admin", "--email", "root@example.org", "--name", "Root")
        out = capsys.readouterr().out
        u = User.objects.get(email="root@example.org")
        assert hasattr(u, "platform_admin") and u.mfa_enabled and u.mfa_secret
        assert "otpauth://totp/" in out and "Temporary password" in out
        with pytest.raises(Exception):
            call_command("create_platform_admin", "--email", "root@example.org", "--name", "Root")
