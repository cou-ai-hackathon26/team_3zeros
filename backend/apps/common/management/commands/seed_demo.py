from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.directory.models import Area, Specialty, Service, CapacityReport
from apps.organizations.models import Facility, Department, Practitioner, PractitionerRole
from apps.scheduling.models import Schedule, Slot
from apps.triage.models import RuleSet
from apps.triage.rules.engine import RED_FLAGS


class Command(BaseCommand):
    help = "Seeds realistic Bangladesh clinical wayfinding pilot data into db.sqlite3."

    def handle(self, *args, **options):
        # 1. Seed approved red-flag ruleset (INV-8)
        RuleSet.objects.update_or_create(
            version="1.0.0",
            defaults={
                "status": "approved",
                "approved_by": "Clinician Safety Board (PLACEHOLDER — Q-06)",
                "rules": RED_FLAGS,
            },
        )

        # 2. Seed administrative areas (Dhaka Division -> Tangail District -> Upazilas)
        dhaka_div, _ = Area.objects.update_or_create(
            code="BD-30",
            defaults={"level": "division", "name_en": "Dhaka Division", "name_bn": "ঢাকা বিভাগ"},
        )
        tangail_dist, _ = Area.objects.update_or_create(
            code="BD-3093",
            defaults={
                "level": "district",
                "parent": dhaka_div,
                "name_en": "Tangail District",
                "name_bn": "টাঙ্গাইল জেলা",
            },
        )
        sadar_upz, _ = Area.objects.update_or_create(
            code="BD-309395",
            defaults={
                "level": "upazila",
                "parent": tangail_dist,
                "name_en": "Tangail Sadar",
                "name_bn": "টাঙ্গাইল সদর",
            },
        )
        mirzapur_upz, _ = Area.objects.update_or_create(
            code="BD-309366",
            defaults={
                "level": "upazila",
                "parent": tangail_dist,
                "name_en": "Mirzapur Upazila",
                "name_bn": "মির্জাপুর উপজেলা",
            },
        )

        # 3. Seed clinical specialties
        specialties_data = [
            ("medicine", "Internal Medicine", "মেডিসিন বিশেষজ্ঞ"),
            ("pediatrics", "Pediatrics", "শিশুরোগ বিশেষজ্ঞ"),
            ("gynecology", "Gynecology & Obstetrics", "স্ত্রীরোগ ও প্রসূতিবিদ্যা"),
            ("cardiology", "Cardiology", "হৃদরোগ বিশেষজ্ঞ"),
            ("orthopedics", "Orthopedics", "হাড় ও জয়েন্ট বিশেষজ্ঞ"),
        ]
        spec_map = {}
        for code, name_en, name_bn in specialties_data:
            spec, _ = Specialty.objects.update_or_create(
                code=code,
                defaults={"name_en": name_en, "name_bn": name_bn},
            )
            spec_map[code] = spec

        # 4. Seed Facilities, Services & Capacity Reports (INV-14)
        tangail_hosp, _ = Facility.objects.update_or_create(
            name="Tangail 250-Bed District Hospital",
            defaults={
                "name_bn": "টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল",
                "type": "district_hospital",
                "area": sadar_upz,
                "address": "Hospital Road, Tangail Sadar",
                "phone": "+88092161444",
            },
        )
        mirzapur_uhc, _ = Facility.objects.update_or_create(
            name="Mirzapur Upazila Health Complex",
            defaults={
                "name_bn": "মির্জাপুর উপজেলা স্বাস্থ্য কমপ্লেক্স",
                "type": "upazila_health_complex",
                "area": mirzapur_upz,
                "address": "Mirzapur Bazar Road, Tangail",
                "phone": "+880922956011",
            },
        )
        dmch, _ = Facility.objects.update_or_create(
            name="Dhaka Medical College Hospital",
            defaults={
                "name_bn": "ঢাকা মেডিকেল কলেজ হাসপাতাল",
                "type": "medical_college_hospital",
                "area": dhaka_div,
                "address": "Secretariat Road, Shahbagh, Dhaka",
                "phone": "+880255165088",
            },
        )

        for fac, beds, wait_min in [
            (tangail_hosp, 18, 25),
            (mirzapur_uhc, 11, 15),
            (dmch, 42, 40),
        ]:
            Department.objects.get_or_create(
                facility=fac,
                name="Outpatient Medicine",
                defaults={"name_bn": "বহির্বিভাগ মেডিসিন"},
            )
            svc, _ = Service.objects.update_or_create(
                facility=fac,
                code="OPD_GEN",
                defaults={"name": "General & Emergency OPD", "name_bn": "বহির্বিভাগ ও জরুরি সেবা"},
            )
            if not fac.capacity_reports.exists():
                CapacityReport.objects.create(
                    facility=fac,
                    service=svc,
                    reported_value={
                        "general_beds_available": beds,
                        "opd_wait_minutes": wait_min,
                        "emergency_open": True,
                    },
                    source="facility_desk",
                )

        # 5. Seed Practitioners, PractitionerRoles & Available Slots
        practitioners_data = [
            ("BMDC-A-41209", "Dr. Rahima Khatun", "ডা. রহিমা খাতুন", tangail_hosp, spec_map["medicine"]),
            ("BMDC-A-38914", "Dr. Mahmudul Hasan", "ডা. মাহমুদুল হাসান", mirzapur_uhc, spec_map["pediatrics"]),
            ("BMDC-A-52103", "Dr. Farzana Akter", "ডা. ফারজানা আক্তার", tangail_hosp, spec_map["gynecology"]),
            ("BMDC-A-29870", "Dr. Anisur Rahman", "ডা. আনিসুর রহমান", dmch, spec_map["cardiology"]),
        ]

        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        for reg_no, name_en, name_bn, fac, spec in practitioners_data:
            prac, _ = Practitioner.objects.update_or_create(
                registration_number=reg_no,
                defaults={"name": name_en, "name_bn": name_bn},
            )
            role, _ = PractitionerRole.objects.update_or_create(
                practitioner=prac,
                facility=fac,
                specialty=spec,
                defaults={"active": True},
            )
            sched, _ = Schedule.objects.get_or_create(
                practitioner_role=role,
                defaults={"recurrence_rules": {"days": ["Sun", "Mon", "Tue", "Wed", "Thu"]}},
            )
            if sched.slots.count() == 0:
                for offset_hours in (2, 4, 24, 26, 48):
                    slot_start = now + timedelta(hours=offset_hours)
                    Slot.objects.create(
                        schedule=sched,
                        start=slot_start,
                        end=slot_start + timedelta(minutes=30),
                        state="AVAILABLE",
                    )

        self.stdout.write(self.style.SUCCESS("Seeded Medi Waypoint Bangladesh clinical pilot database."))
