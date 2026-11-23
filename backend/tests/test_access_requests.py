import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User, PlatformAdmin, Membership
from apps.organizations.models import Facility, Practitioner, AccessRequest

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def platform_admin():
    user = User.objects.create_user(
        email="platform@demo.com",
        username="platform",
        password="Password123!",
        display_name="Platform Admin",
    )
    PlatformAdmin.objects.create(user=user)
    return user

@pytest.fixture
def facility():
    return Facility.objects.create(
        name="Dhaka Medical College Hospital",
        name_bn="ঢাকা মেডিকেল কলেজ হাসপাতাল",
        type="medical_college_hospital",
    )

@pytest.fixture
def facility_admin(facility):
    user = User.objects.create_user(
        email="admin@hospital.com",
        username="hospadmin",
        password="Password123!",
        display_name="Hospital Admin",
    )
    Membership.objects.create(
        user=user,
        facility=facility,
        role="facility_admin",
        permissions=["schedule.manage", "referral.acknowledge", "referral.create"],
    )
    return user


@pytest.mark.django_db
def test_access_request_create_existing_facility(api_client, facility):
    resp = api_client.post("/api/v1/access-requests", {
        "name": "Dr. Sarah Khan",
        "bmdc_registration_number": "A-99123",
        "contact": "sarah@gmail.com",
        "facility_id": str(facility.public_id),
    }, format="json")
    assert resp.status_code == 201
    data = resp.json()
    assert "reference" in data
    assert data["status"] == "PENDING"

    ar = AccessRequest.objects.get(public_id=data["reference"])
    assert ar.name == "Dr. Sarah Khan"
    assert ar.facility == facility
    assert ar.bmdc_registration_number == "A-99123"


@pytest.mark.django_db
def test_access_request_create_private_chamber(api_client):
    resp = api_client.post("/api/v1/access-requests", {
        "name": "Dr. Rafiqul Islam",
        "bmdc_registration_number": "A-88442",
        "contact": "+8801711223344",
        "chamber_name": "Dr. Rafiqul Consultation Center",
        "chamber_name_bn": "ডা. রফিকুল কনসাল্টেশন সেন্টার",
    }, format="json")
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "PENDING"

    ar = AccessRequest.objects.get(public_id=data["reference"])
    assert ar.chamber_name == "Dr. Rafiqul Consultation Center"
    assert ar.facility is None


@pytest.mark.django_db
def test_access_request_validation(api_client):
    resp = api_client.post("/api/v1/access-requests", {
        "name": "Dr. No Target",
        "bmdc_registration_number": "A-00000",
        "contact": "test@test.com",
    }, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_admin_list_and_approve_private_chamber(api_client, platform_admin):
    # 1. Create a private chamber request
    ar = AccessRequest.objects.create(
        name="Dr. Kamal Hossain",
        bmdc_registration_number="A-55443",
        contact="kamal@doctor.com",
        chamber_name="Kamal Heart Care",
        chamber_name_bn="কামাল হার্ট কেয়ার",
    )

    # 2. List as platform admin
    api_client.force_authenticate(user=platform_admin)
    list_resp = api_client.get("/api/v1/admin/access-requests")
    assert list_resp.status_code == 200
    results = list_resp.json()["results"]
    assert any(r["id"] == str(ar.public_id) for r in results)

    # 3. Approve request as platform admin
    approve_resp = api_client.post(f"/api/v1/admin/access-requests/{ar.public_id}/approve")
    assert approve_resp.status_code == 200
    approve_data = approve_resp.json()
    assert approve_data["status"] == "APPROVED"

    # Verify Facility was created with private_chamber type
    fac = Facility.objects.get(public_id=approve_data["facility_id"])
    assert fac.type == "private_chamber"
    assert fac.name == "Kamal Heart Care"

    # Verify doctor user, memberships and practitioner were created
    doc_user = User.objects.get(email="kamal@doctor.com")
    assert doc_user.display_name == "Dr. Kamal Hossain"
    assert Membership.objects.filter(user=doc_user, facility=fac, role="facility_admin").exists()
    assert Membership.objects.filter(user=doc_user, facility=fac, role="clinician").exists()
    prac = Practitioner.objects.get(user=doc_user)
    assert prac.registration_number == "A-55443"

    # Verify request status updated
    ar.refresh_from_db()
    assert ar.status == "APPROVED"
    assert ar.reviewed_by == platform_admin


@pytest.mark.django_db
def test_admin_reject_access_request(api_client, platform_admin):
    ar = AccessRequest.objects.create(
        name="Fake Doctor",
        bmdc_registration_number="INVALID",
        contact="fake@test.com",
        chamber_name="Fake Chamber",
    )
    api_client.force_authenticate(user=platform_admin)
    resp = api_client.post(f"/api/v1/admin/access-requests/{ar.public_id}/reject", {
        "reason": "Invalid BMDC registration number.",
    }, format="json")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "REJECTED"
    assert data["reason"] == "Invalid BMDC registration number."

    ar.refresh_from_db()
    assert ar.status == "REJECTED"
    assert ar.rejection_reason == "Invalid BMDC registration number."

