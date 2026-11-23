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
    # An older seed created this user by phone only; adopt it instead of colliding on the phone.
    User.objects.filter(phone="+8801700000001", email__isnull=True).update(email="patient@demo.com")
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

    # 7b. Sample verified lab report for demo patient (so /reports displays live data)
    from apps.documents.models import Document, ExtractionJob, ExtractedField

    demo_doc, doc_created = Document.objects.get_or_create(
        patient=patient_record,
        original_filename="CBC_Blood_Report.pdf",
        defaults={
            "uploaded_by": doc_user,
            "storage_key": "documents/demo-cbc-report",
            "content_type": "application/pdf",
            "size": 245760,
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "state": "VERIFIED",
        },
    )
    if doc_created or not demo_doc.extraction_jobs.exists():
        job = ExtractionJob.objects.create(document=demo_doc, engine="demo-ocr", engine_version="1.0")
        ExtractedField.objects.create(
            job=job,
            name="Hemoglobin",
            value="13.4",
            unit="g/dL",
            lab="Savar Upazila Health Complex Lab",
            confidence=0.97,
            page=1,
            status="accepted",
            verified_by=doc_user,
            verified_at=timezone.now(),
        )
        ExtractedField.objects.create(
            job=job,
            name="WBC Count",
            value="7.2",
            unit="10^9/L",
            lab="Savar Upazila Health Complex Lab",
            confidence=0.95,
            page=1,
            status="accepted",
            verified_by=doc_user,
            verified_at=timezone.now(),
        )

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

    # 9. More demo accounts (staff of every role, a private chamber, a second patient)
    from apps.accounts.security import new_totp_secret

    def make_user(email, name, phone=None, mfa=False):
        u, made = User.objects.get_or_create(
            email=email,
            defaults={"display_name": name, "phone": phone, "preferred_language": "en", "is_active": True},
        )
        if made or not u.has_usable_password():
            u.set_password("Password123!")
        if mfa and not u.mfa_secret:
            u.mfa_enabled = True
            u.mfa_secret = new_totp_secret()
        u.save()
        return u

    def make_clinician(user, facility, reg_no, name, name_bn):
        Membership.objects.get_or_create(
            user=user, facility=facility, role="clinician",
            defaults={"permissions": ["referral.create", "referral.acknowledge", "schedule.manage", "emergency.create"]},
        )
        Practitioner.objects.get_or_create(registration_number=reg_no, defaults={"name": name, "name_bn": name_bn, "user": user})

    receiving = make_user("receiving.doctor@demo.com", "Dr. Farhana Islam", "+8801711223355")
    make_clinician(receiving, fac_dmch, "BMDC-A-51377", "Dr. Farhana Islam", "ডাঃ ফারহানা ইসলাম")

    staff = make_user("staff@demo.com", "Rina Akter (Front desk)", "+8801711223366")
    Membership.objects.get_or_create(user=staff, facility=fac_savar, role="facility_staff", defaults={"permissions": ["schedule.manage"]})

    fac_admin = make_user("facility.admin@demo.com", "Hasan Mahmud (Facility admin)", "+8801711223377", mfa=True)
    Membership.objects.get_or_create(user=fac_admin, facility=fac_savar, role="facility_admin")

    chamber, _ = Facility.objects.get_or_create(
        name="Dr. Nusrat Chamber",
        defaults={"name_bn": "ডাঃ নুসরাত চেম্বার", "type": "private_chamber", "area": dhaka_dist, "address": "Dhanmondi, Dhaka", "phone": "+8801711000003"},
    )
    chamber_doc = make_user("chamber.doctor@demo.com", "Dr. Nusrat Jahan", "+8801711223388", mfa=True)
    make_clinician(chamber_doc, chamber, "BMDC-A-60214", "Dr. Nusrat Jahan", "ডাঃ নুসরাত জাহান")
    Membership.objects.get_or_create(user=chamber_doc, facility=chamber, role="facility_admin")

    patient2 = make_user("patient2@demo.com", "Rahima Begum", "+8801700000002")
    patient2_record, _ = Patient.objects.get_or_create(
        phone="+8801700000002",
        defaults={"given_name": "Rahima", "family_name": "Begum", "name_bn": "রহিমা বেগম", "sex": "female", "estimated_age": 52, "area": savar_upazila},
    )
    PatientAccount.objects.get_or_create(user=patient2, defaults={"patient": patient2_record})

    print("Demo data seeded successfully:")
    print("  Clinician: doctor@demo.com / Password123!")
    print("  Patient: patient@demo.com / Password123!")
    print("  Admin: admin@demo.com / Password123!")
    print("  Receiving doctor (DMCH): receiving.doctor@demo.com / Password123!")
    print("  Front desk staff: staff@demo.com / Password123!")
    print("  Facility admin (admin entrance, MFA code 123456 in local dev): facility.admin@demo.com / Password123!")
    print("  Private chamber doctor + admin (MFA 123456 in local dev): chamber.doctor@demo.com / Password123!")
    print("  Second patient: patient2@demo.com / Password123!")

if __name__ == "__main__":
    seed()

