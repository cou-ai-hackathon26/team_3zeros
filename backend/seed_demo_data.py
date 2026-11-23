import os
import django
from datetime import timedelta
from django.utils import timezone

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from apps.accounts.models import User, Membership, PatientAccount
from apps.organizations.models import Facility, Department, Practitioner, PractitionerRole
from apps.directory.models import Area, Specialty, Service, CapacityReport
from apps.identity.models import Patient
from apps.scheduling.models import Schedule, Slot

def seed():
    print("Seeding demo data...")

    # 1. Areas
    dhaka_div, _ = Area.objects.get_or_create(level="division", name_en="Dhaka Division", name_bn="ঢাকা বিভাগ", code="30")
    dhaka_dist, _ = Area.objects.get_or_create(level="district", parent=dhaka_div, name_en="Dhaka District", name_bn="ঢাকা জেলা", code="26")
    savar_upazila, _ = Area.objects.get_or_create(level="upazila", parent=dhaka_dist, name_en="Savar", name_bn="সাভার", code="2672")

    # 2. Specialties
    cardio, _ = Specialty.objects.get_or_create(code="cardiology", defaults={"name_en": "Cardiology", "name_bn": "হৃদরোগ"})
    pedia, _ = Specialty.objects.get_or_create(code="pediatrics", defaults={"name_en": "Pediatrics", "name_bn": "শিশু রোগ"})
    gen_med, _ = Specialty.objects.get_or_create(code="general_medicine", defaults={"name_en": "General Medicine", "name_bn": "সাধারণ মেডিসিন"})

    # 3. Facilities
    fac_savar, _ = Facility.objects.get_or_create(
        name="Savar Upazila Health Complex",
        defaults={
            "name_bn": "সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স",
            "type": "upazila_health_complex",
            "area": savar_upazila,
            "address": "Savar Bazar Road, Savar, Dhaka",
            "phone": "+8801711000001",
        }
    )
    fac_dmch, _ = Facility.objects.get_or_create(
        name="Dhaka Medical College Hospital",
        defaults={
            "name_bn": "ঢাকা মেডিকেল কলেজ হাসপাতাল",
            "type": "medical_college_hospital",
            "area": dhaka_dist,
            "address": "Secretariat Road, Dhaka 1000",
            "phone": "+8801711000002",
        }
    )

    # 4. Services & Capacity
    Service.objects.get_or_create(facility=fac_savar, code="emergency", defaults={"name": "24/7 Emergency Care", "name_bn": "জরুরী বিভাগ"})
    Service.objects.get_or_create(facility=fac_savar, code="outpatient", defaults={"name": "Outpatient Clinic", "name_bn": "বহির্বিভাগ"})
    CapacityReport.objects.create(facility=fac_savar, reported_value={"general_beds": 50, "vacant_beds": 12}, source="manual")

    # 5. Clinician user & practitioner profile
    doc_user, created = User.objects.get_or_create(
        email="doctor@demo.com",
        defaults={
            "phone": "+8801711223344",
            "display_name": "Dr. Anisur Rahman",
            "preferred_language": "bn",
            "is_active": True,
        }
    )
    if created or not doc_user.has_usable_password():
        doc_user.set_password("Password123!")
        doc_user.save()

    Membership.objects.get_or_create(
        user=doc_user,
        facility=fac_savar,
        role="clinician",
        defaults={"permissions": ["referral.create", "referral.acknowledge", "schedule.manage", "emergency.create"]}
    )

    practitioner, _ = Practitioner.objects.get_or_create(
        registration_number="BMDC-A-45892",
        defaults={
            "name": "Dr. Anisur Rahman",
            "name_bn": "ডাঃ আনিসুর রহমান",
            "user": doc_user,
        }
    )
    role, _ = PractitionerRole.objects.get_or_create(
        practitioner=practitioner,
        facility=fac_savar,
        specialty=gen_med,
        defaults={"active": True}
    )

    # 6. Slots
    schedule, _ = Schedule.objects.get_or_create(practitioner_role=role)
    now = timezone.now()
    for day_offset in range(1, 4):
        base_time = (now + timedelta(days=day_offset)).replace(hour=10, minute=0, second=0, microsecond=0)
        for slot_idx in range(4):
            start = base_time + timedelta(minutes=slot_idx * 30)
            end = start + timedelta(minutes=30)
            Slot.objects.get_or_create(
                schedule=schedule,
                start=start,
                defaults={"end": end, "state": "AVAILABLE"}
            )

    # 7. Demo Patient user
    patient_user, p_created = User.objects.get_or_create(
        email="patient@demo.com",
        defaults={
            "phone": "+8801700000001",
            "display_name": "Karim Ahmed",
            "preferred_language": "bn",
            "is_active": True,
        }
    )
    patient_record, _ = Patient.objects.get_or_create(
        phone="+8801700000001",
        defaults={
            "given_name": "Karim",
            "family_name": "Ahmed",
            "name_bn": "করিম আহমেদ",
            "sex": "male",
            "estimated_age": 35,
            "area": savar_upazila,
        }
    )
    if p_created or not patient_user.has_usable_password():
        patient_user.set_password("Password123!")
        patient_user.save()
    PatientAccount.objects.get_or_create(user=patient_user, defaults={"patient": patient_record})

    # 8. Admin user
    admin_user, a_created = User.objects.get_or_create(
        email="admin@demo.com",
        defaults={
            "display_name": "System Administrator",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        }
    )
    if a_created or not admin_user.has_usable_password():
        admin_user.set_password("Password123!")
        admin_user.save()

    print("Demo data seeded successfully:")
    print("  Clinician: doctor@demo.com / Password123!")
    print("  Patient: patient@demo.com / Password123!")
    print("  Admin: admin@demo.com / Password123!")

if __name__ == "__main__":
    seed()

