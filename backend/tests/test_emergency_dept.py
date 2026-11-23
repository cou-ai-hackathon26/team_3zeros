import pytest
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from apps.organizations.models import Facility
from apps.identity.models import Patient
from apps.records.models import Encounter, ClinicalObservation
from apps.accounts.models import Membership
from apps.emergency_dept.models import EDVisit

User = get_user_model()

@pytest.fixture
def facility(db):
    return Facility.objects.create(
        name="Dhaka Medical College Hospital",
        name_bn="ঢাকা মেডিকেল কলেজ হাসপাতাল",
        type="district_hospital",
    )

@pytest.fixture
def transfer_facility(db):
    return Facility.objects.create(
        name="National Institute of Cardiovascular Diseases",
        name_bn="জাতীয় হৃদরোগ ইনস্টিটিউট",
        type="specialized_hospital",
    )

@pytest.fixture
def ed_clinician(db, facility):
    u = User.objects.create_user(email="ed_doc@example.org", password="ValidPass123!#")
    Membership.objects.create(user=u, facility=facility, role="clinician", permissions=["ed.manage"])
    return u

@pytest.fixture
def ed_staff(db, facility):
    u = User.objects.create_user(email="ed_nurse@example.org", password="ValidPass123!#")
    Membership.objects.create(user=u, facility=facility, role="facility_staff", permissions=["ed.manage"])
    return u

@pytest.fixture
def unauthorized_user(db, facility):
    u = User.objects.create_user(email="regular@example.org", password="ValidPass123!#")
    Membership.objects.create(user=u, facility=facility, role="facility_staff", permissions=[])
    return u

@pytest.fixture
def patient(db):
    return Patient.objects.create(
        given_name="Karim",
        family_name="Uddin",
        name_bn="করিম উদ্দিন",
        phone="+8801711223344",
        sex="male",
    )

@pytest.mark.django_db
class TestEmergencyDepartment:
    def test_create_ed_visit_with_patient_and_vitals(self, ed_staff, facility, patient):
        client = APIClient()
        client.force_authenticate(user=ed_staff)

        payload = {
            "facility_id": str(facility.public_id),
            "patient_id": str(patient.public_id),
            "chief_complaint": "Severe acute chest pain radiating to left arm",
            "arrival_mode": "AMBULANCE",
            "vitals": {
                "pulse": "115",
                "systolic": "165",
                "diastolic": "100",
                "temperature": "37.2",
                "spo2": "94",
                "respiratory_rate": "24",
            },
        }

        r = client.post("/api/v1/ed-visits", payload, format="json")
        assert r.status_code == 201
        data = r.data
        assert data["state"] == "ARRIVED"
        assert data["chief_complaint"] == "Severe acute chest pain radiating to left arm"
        assert data["arrival_mode"] == "AMBULANCE"
        assert data["patient_id"] == str(patient.public_id)
        assert data["facility_id"] == str(facility.public_id)
        assert "triage" in data["allowed_actions"]
        assert "start_care" in data["allowed_actions"]

        # Verify underlying Encounter and Observations
        assert data["encounter_id"] is not None
        encounter = Encounter.objects.get(public_id=data["encounter_id"])
        assert encounter.encounter_type == "emergency"
        assert encounter.patient == patient
        assert encounter.facility == facility

        obs = encounter.observations.all()
        assert obs.count() == 6
        pulse_obs = obs.filter(code="8867-4").first()
        assert pulse_obs is not None
        assert pulse_obs.value_numeric == 115.0
        assert pulse_obs.unit == "bpm"

    def test_create_ed_visit_unidentified_patient(self, ed_staff, facility):
        client = APIClient()
        client.force_authenticate(user=ed_staff)

        payload = {
            "facility_id": str(facility.public_id),
            "patient_name": "Road Traffic Accident Male",
            "patient_sex": "male",
            "chief_complaint": "Unconscious following high-speed RTA",
            "arrival_mode": "POLICE",
        }

        r = client.post("/api/v1/ed-visits", payload, format="json")
        assert r.status_code == 201
        data = r.data
        assert data["state"] == "ARRIVED"

        # Check created patient
        created_patient = Patient.objects.get(public_id=data["patient_id"])
        assert created_patient.given_name == "Road"
        assert created_patient.sex == "male"

    def test_triage_transition_and_vitals(self, ed_staff, facility, patient):
        client = APIClient()
        client.force_authenticate(user=ed_staff)

        # 1. Create visit
        r1 = client.post("/api/v1/ed-visits", {
            "facility_id": str(facility.public_id),
            "patient_id": str(patient.public_id),
            "chief_complaint": "Difficulty breathing",
        }, format="json")
        visit_id = r1.data["id"]

        # 2. Triage action
        r2 = client.post(f"/api/v1/ed-visits/{visit_id}/actions/triage", {
            "category": "ORANGE",
            "notes": "Stridor, SpO2 88% on room air",
            "vitals": {"spo2": "88", "pulse": "128"},
        }, format="json")
        assert r2.status_code == 200
        assert r2.data["state"] == "TRIAGED"
        assert r2.data["triage_category"] == "ORANGE"
        assert r2.data["triaged_by_name"] == ed_staff.display_name or ed_staff.email

        # Allowed actions from TRIAGED
        assert "start_care" in r2.data["allowed_actions"]
        assert "admit" in r2.data["allowed_actions"]
        assert "transfer" in r2.data["allowed_actions"]

    def test_full_lifecycle_to_discharge(self, ed_clinician, facility, patient):
        client = APIClient()
        client.force_authenticate(user=ed_clinician)

        # 1. Arrive
        r1 = client.post("/api/v1/ed-visits", {
            "patient_id": str(patient.public_id),
            "chief_complaint": "Acute abdominal pain",
        }, format="json")
        visit_id = r1.data["id"]

        # 2. Triage
        r2 = client.post(f"/api/v1/ed-visits/{visit_id}/actions/triage", {
            "category": "YELLOW",
        }, format="json")
        assert r2.status_code == 200
        assert r2.data["state"] == "TRIAGED"

        # 3. Start care
        r3 = client.post(f"/api/v1/ed-visits/{visit_id}/actions/start_care", {}, format="json")
        assert r3.status_code == 200
        assert r3.data["state"] == "UNDER_CARE"

        # 4. Discharge with clinical summary
        r4 = client.post(f"/api/v1/ed-visits/{visit_id}/actions/discharge", {
            "summary": "Acute gastroenteritis resolved with IV hydration and antiemetics. Stable for discharge.",
            "notes": "Follow up with OPD in 3 days if symptoms recur.",
        }, format="json")
        assert r4.status_code == 200
        assert r4.data["state"] == "DISCHARGED"
        assert "Acute gastroenteritis" in r4.data["discharge_summary"]
        assert r4.data["disposition_at"] is not None
        assert r4.data["allowed_actions"] == []  # Terminal state

    def test_transfer_action(self, ed_clinician, facility, transfer_facility, patient):
        client = APIClient()
        client.force_authenticate(user=ed_clinician)

        # Arrive
        r1 = client.post("/api/v1/ed-visits", {
            "patient_id": str(patient.public_id),
            "chief_complaint": "STEMI on ECG requiring PCI",
        }, format="json")
        visit_id = r1.data["id"]

        # Transfer
        r2 = client.post(f"/api/v1/ed-visits/{visit_id}/actions/transfer", {
            "transfer_facility_id": str(transfer_facility.public_id),
            "notes": "Referred to NICVD for primary PCI.",
        }, format="json")
        assert r2.status_code == 200
        assert r2.data["state"] == "TRANSFERRED"
        assert r2.data["transfer_facility_id"] == str(transfer_facility.public_id)

    def test_permission_denied_for_unauthorized_user(self, unauthorized_user, facility, patient):
        client = APIClient()
        client.force_authenticate(user=unauthorized_user)

        # Visit created by someone else
        visit = EDVisit.objects.create(
            facility=facility,
            patient=patient,
            chief_complaint="Severe pain",
            state="ARRIVED",
        )

        r = client.post(f"/api/v1/ed-visits/{visit.public_id}/actions/triage", {
            "category": "RED",
        }, format="json")
        assert r.status_code == 403
