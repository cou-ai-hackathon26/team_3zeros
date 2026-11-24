import pytest
from django.core.management import call_command
from apps.accounts.models import Membership
from apps.directory.models import Area, CapacityReport, Service
from apps.emergency_dept.models import EDVisit
from apps.identity.models import Patient, PatientIdentifier
from apps.identity.selectors import search_patients
from apps.organizations.models import Department, Facility, Practitioner, PractitionerRole
from apps.accounts.models import User
from apps.scheduling.models import Slot


@pytest.mark.django_db
def test_seed_covers_every_district_and_every_hospital_has_an_emergency_section():
    call_command("seed_bangladesh", count=160, force=True)
    assert Area.objects.filter(level="division").count() == 8 and Area.objects.filter(level="district").count() == 64
    districts_with_doctors = set(PractitionerRole.objects.values_list("facility__area_id", flat=True))
    assert set(Area.objects.filter(level="district").values_list("id", flat=True)) <= districts_with_doctors
    for fac in Facility.objects.all():
        assert Department.objects.filter(facility=fac, name="Emergency Department").exists()
        assert Service.objects.filter(facility=fac, code="emergency").exists()
        assert CapacityReport.objects.filter(facility=fac, service__code="emergency").exists()
        assert Membership.objects.filter(facility=fac, permissions__contains=["ed.manage"]).exists()
        assert PractitionerRole.objects.filter(facility=fac, specialty__code="emergency_medicine").exists()
    assert EDVisit.objects.exists() and Slot.objects.filter(state="AVAILABLE").exists()

    assert Patient.objects.count() == 160 and not Patient.objects.filter(account=None).exists()
    for p in Patient.objects.all()[:20]:
        assert {"system_id", "health_id", "facility_mrn"} <= set(p.identifiers.values_list("system", flat=True))
        assert p.encounters.exists() and p.name_bn and p.birth_date and p.phone and p.area_id

    doctor = User.objects.get(email="doctor0100@seed.medi-waypoint.test")
    assert doctor.has_usable_password() and Practitioner.objects.get(user=doctor).name_bn
    assert search_patients(doctor).exists()  # seeded history gives each doctor a patient list


@pytest.mark.django_db
def test_seed_is_idempotent_and_refuses_without_debug():
    call_command("seed_bangladesh", count=80, force=True)
    before = (User.objects.count(), Patient.objects.count(), Practitioner.objects.count(), Facility.objects.count(), EDVisit.objects.count(), PatientIdentifier.objects.count())
    call_command("seed_bangladesh", count=80, force=True)
    assert before == (User.objects.count(), Patient.objects.count(), Practitioner.objects.count(), Facility.objects.count(), EDVisit.objects.count(), PatientIdentifier.objects.count())
    from django.core.management.base import CommandError
    with pytest.raises(CommandError):
        call_command("seed_bangladesh", count=1)
