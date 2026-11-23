import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User, Membership
from apps.organizations.models import Facility

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def auth_setup(db):
    user = User.objects.create_user(
        phone="+8801712345678",
        email="doctor@medidemo.com",
        password="secretpassword123",
        display_name="Dr. Nasreen",
    )
    facility = Facility.objects.create(name="Upazila Health Complex Savar", name_bn="সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স")
    Membership.objects.create(user=user, facility=facility, role="clinician", permissions=["referral.create", "schedule.manage"])
    return {"user": user, "facility": facility}

@pytest.mark.django_db
def test_login_and_me_endpoint(api_client, auth_setup):
    data = auth_setup
    # 1. Login with password
    login_resp = api_client.post("/api/v1/auth/login", {
        "email": "doctor@medidemo.com",
        "password": "secretpassword123",
    })
    assert login_resp.status_code == 200
    assert "user_id" in login_resp.data

    # 2. Call /auth/me
    me_resp = api_client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.data["email"] == "doctor@medidemo.com"
    assert me_resp.data["display_name"] == "Dr. Nasreen"
    assert "clinician" in me_resp.data["roles"]

    # 3. Switch active facility
    fac_resp = api_client.post("/api/v1/auth/active-facility", {
        "facility_id": str(data["facility_facility_id"] if "facility_facility_id" in data else data["facility"].public_id)
    })
    assert fac_resp.status_code == 200

    # 4. Logout
    logout_resp = api_client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

@pytest.mark.django_db
def test_patient_registers_with_email_and_password_and_gets_the_patient_role(api_client):
    r = api_client.post("/api/v1/auth/register", {"email": "karim@example.org", "display_name": "Karim", "password": "a-long-passphrase-9"}, format="json")
    assert r.status_code == 201
    me = api_client.get("/api/v1/auth/me").data
    assert me["roles"] == ["patient"] and me["email"] == "karim@example.org"
    # and can sign in again with email or username
    assert APIClient().post("/api/v1/auth/login", {"email": "karim@example.org", "password": "a-long-passphrase-9"}, format="json").status_code == 200

@pytest.mark.django_db
def test_admin_role_access_and_views(api_client):
    admin_user = User.objects.create_user(
        email="admin@medidemo.com",
        password="secretpassword123",
        display_name="Facility Administrator",
    )
    facility = Facility.objects.create(name="Upazila Health Complex Savar", name_bn="সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স")
    Membership.objects.create(user=admin_user, facility=facility, role="facility_admin")

    # Admins use the separate entrance, with MFA (MASTERPLAN D-17); the staff entrance refuses them.
    from apps.accounts.security import new_totp_secret, totp_code
    admin_user.mfa_enabled = True
    admin_user.mfa_secret = new_totp_secret()
    admin_user.save()
    refused = api_client.post("/api/v1/auth/login", {"email": "admin@medidemo.com", "password": "secretpassword123"})
    assert refused.status_code == 401
    api_client.post("/api/v1/auth/admin/login", {"email": "admin@medidemo.com", "password": "secretpassword123"})
    api_client.post("/api/v1/auth/mfa/verify", {"code": totp_code(admin_user.mfa_secret)})

    # A-23: active_facility defaulted automatically
    me_resp = api_client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.data["active_facility"] is not None
    assert me_resp.data["active_facility"]["id"] == str(facility.public_id)

    # A-05: /admin/facilities, /admin/staff, /admin/schedules work without field error
    fac_resp = api_client.get("/api/v1/admin/facilities")
    assert fac_resp.status_code == 200
    assert len(fac_resp.data["results"]) >= 1

    staff_resp = api_client.get("/api/v1/admin/staff")
    assert staff_resp.status_code == 200
    assert len(staff_resp.data["results"]) >= 1

    sched_resp = api_client.get("/api/v1/admin/schedules")
    assert sched_resp.status_code == 200


