import pytest
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APIClient
from apps.accounts.models import User, Membership
from apps.organizations.models import Facility, Practitioner
from apps.identity.models import Patient
from apps.records.models import Encounter, ClinicalObservation, ClinicalOrder

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def continuity_setup(db):
    user = User.objects.create_user(email="doctor@chamber.com", password="password")
    facility = Facility.objects.create(name="Dhanmondi Specialist Chamber", type="private_chamber")
    practitioner = Practitioner.objects.create(user=user, name="Dr. Sabrina Rahman", registration_number="BMDC-77889")
    Membership.objects.create(user=user, facility=facility, role="clinician")

    patient = Patient.objects.create(
        given_name="Anisur",
        family_name="Rahman",
        phone="+8801811223344",
        sex="male",
    )

    encounter = Encounter.objects.create(
        patient=patient,
        facility=facility,
        practitioner=practitioner,
        period_start=timezone.now(),
        encounter_type="outpatient",
        reason="Hypertension follow-up and chest tightness",
    )

    return {
        "user": user,
        "facility": facility,
        "practitioner": practitioner,
        "patient": patient,
        "encounter": encounter,
    }

@pytest.mark.django_db
def test_results_timeline_grouped_by_test(api_client, continuity_setup):
    api_client.force_authenticate(user=continuity_setup["user"])
    patient = continuity_setup["patient"]
    encounter = continuity_setup["encounter"]

    now = timezone.now()
    # Create two observations for Serum Creatinine at different dates
    obs1 = ClinicalObservation.objects.create(
        encounter=encounter,
        patient=patient,
        code="2160-0",
        display_name="Serum Creatinine",
        value_numeric=1.1,
        unit="mg/dL",
        observed_date=now - timedelta(days=5),
    )
    obs2 = ClinicalObservation.objects.create(
        encounter=encounter,
        patient=patient,
        code="2160-0",
        display_name="Serum Creatinine",
        value_numeric=1.4,
        unit="mg/dL",
        observed_date=now - timedelta(days=40),
    )
    # Create one observation for Hemoglobin
    obs3 = ClinicalObservation.objects.create(
        encounter=encounter,
        patient=patient,
        code="718-7",
        display_name="Hemoglobin",
        value_numeric=13.2,
        unit="g/dL",
        observed_date=now - timedelta(days=2),
    )

    resp = api_client.get(f"/api/v1/patients/{patient.public_id}/results")
    assert resp.status_code == 200
    data = resp.json()

    assert "results" in data
    assert len(data["results"]) == 3
    assert all(r["verified"] is True for r in data["results"])

    assert "timeline" in data
    timeline = data["timeline"]
    assert len(timeline) == 2  # Serum Creatinine and Hemoglobin

    creat_group = next(g for g in timeline if g["test_name"] == "Serum Creatinine")
    assert creat_group["code"] == "2160-0"
    assert len(creat_group["results"]) == 2
    # Verify chronological sorting (newest first)
    assert float(creat_group["results"][0]["value"]) == 1.1
    assert float(creat_group["results"][1]["value"]) == 1.4
    assert creat_group["results"][0]["lab"] == "Dhanmondi Specialist Chamber"

@pytest.mark.django_db
def test_diagnostic_order_with_recent_results_advisory_inv15(api_client, continuity_setup):
    """
    Test duplicate test ordering returns recent verified results advisory
    without auto-cancelling the order (INV-15).
    """
    api_client.force_authenticate(user=continuity_setup["user"])
    patient = continuity_setup["patient"]
    encounter = continuity_setup["encounter"]
    now = timezone.now()

    # Prior observation from 8 days ago
    ClinicalObservation.objects.create(
        encounter=encounter,
        patient=patient,
        code="2160-0",
        display_name="Serum Creatinine",
        value_numeric=1.2,
        unit="mg/dL",
        observed_date=now - timedelta(days=8),
    )

    # Place order for same test
    resp = api_client.post(
        f"/api/v1/encounters/{encounter.public_id}/orders",
        {
            "test_name": "Serum Creatinine",
            "code": "2160-0",
            "priority": "ROUTINE",
            "notes": "Evaluate baseline kidney function before adjusting ACE inhibitor",
        },
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()

    # The order MUST exist and be in PLACED status (never cancelled!)
    assert data["order"]["status"] == "PLACED"
    assert data["order"]["test_name"] == "Serum Creatinine"
    assert ClinicalOrder.objects.filter(public_id=data["order"]["id"]).exists()

    # Recent results advisory must be populated
    assert data["advisory"] is not None
    assert "Recent result available: Serum Creatinine was performed 8 day(s) ago" in data["advisory"]
    assert "duplicate tests are never cancelled automatically (INV-15)" in data["advisory"]
    assert len(data["recent_results"]) == 1
    assert data["recent_results"][0]["days_ago"] == 8
    assert data["recent_results"][0]["value"] == "1.2 mg/dL"
    assert data["recent_results"][0]["facility_name"] == "Dhanmondi Specialist Chamber"

@pytest.mark.django_db
def test_diagnostic_order_without_recent_results(api_client, continuity_setup):
    api_client.force_authenticate(user=continuity_setup["user"])
    encounter = continuity_setup["encounter"]

    resp = api_client.post(
        f"/api/v1/encounters/{encounter.public_id}/orders",
        {
            "test_name": "Echocardiogram",
            "priority": "URGENT",
            "notes": "Assess left ventricular hypertrophy",
        },
        format="json",
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["order"]["status"] == "PLACED"
    assert data["order"]["priority"] == "URGENT"
    assert data["advisory"] is None
    assert data["recent_results"] == []

    # Verify listing orders
    list_resp = api_client.get(f"/api/v1/encounters/{encounter.public_id}/orders")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["orders"]) == 1
    assert list_resp.json()["orders"][0]["test_name"] == "Echocardiogram"

@pytest.mark.django_db
def test_chart_active_allergies_medications_and_problems(api_client, continuity_setup):
    api_client.force_authenticate(user=continuity_setup["user"])
    patient = continuity_setup["patient"]
    encounter = continuity_setup["encounter"]

    # Record an allergy observation
    api_client.post(
        f"/api/v1/encounters/{encounter.public_id}/allergies",
        {
            "code": "allergy-penicillin",
            "display_name": "Penicillin Allergy",
            "value_string": "Severe urticaria and facial swelling",
        },
        format="json",
    )

    # Record a medication observation
    api_client.post(
        f"/api/v1/encounters/{encounter.public_id}/medications",
        {
            "code": "rx-amlodipine",
            "display_name": "Amlodipine tablet",
            "value_string": "5 mg once daily orally",
        },
        format="json",
    )

    chart_resp = api_client.get(f"/api/v1/patients/{patient.public_id}/chart")
    assert chart_resp.status_code == 200
    chart_data = chart_resp.json()

    assert "active_allergies" in chart_data
    assert len(chart_data["active_allergies"]) == 1
    assert chart_data["active_allergies"][0]["name"] == "Penicillin Allergy"
    assert chart_data["active_allergies"][0]["reaction"] == "Severe urticaria and facial swelling"

    assert "active_medications" in chart_data
    assert len(chart_data["active_medications"]) == 1
    assert chart_data["active_medications"][0]["name"] == "Amlodipine tablet"
    assert chart_data["active_medications"][0]["dosage"] == "5 mg once daily orally"

    assert "active_problems" in chart_data
    assert any("Hypertension" in p["reason"] for p in chart_data["active_problems"])
