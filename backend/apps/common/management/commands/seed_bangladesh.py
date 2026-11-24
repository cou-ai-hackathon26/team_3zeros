import random
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.catalogue import PERMISSION_CODES
from apps.accounts.models import Membership, PatientAccount, User
from apps.common import seed_data as D
from apps.directory.models import Area, CapacityReport, Service, Specialty
from apps.emergency_dept.models import EDVisit
from apps.identity.models import Patient, PatientIdentifier, generate_system_patient_id
from apps.organizations.models import Department, Facility, Practitioner, PractitionerRole
from apps.records.models import ClinicalObservation, Encounter
from apps.scheduling.models import Schedule, Slot

DOMAIN = "seed.medi-waypoint.test"
DHAKA = ZoneInfo("Asia/Dhaka")
WORKDAYS = (6, 0, 1, 2, 3)  # Sunday to Thursday (datetime.weekday)
DOCTOR_PERMISSIONS = ["schedule.manage", "referral.create", "referral.acknowledge"]
EMERGENCY_DOCTOR_PERMISSIONS = DOCTOR_PERMISSIONS + ["emergency.create", "ed.manage"]
ED_STATES = [("ARRIVED", 10), ("TRIAGED", 15), ("UNDER_CARE", 15), ("ADMITTED", 20), ("DISCHARGED", 30), ("TRANSFERRED", 5), ("LEFT", 3), ("DIED", 2)]
TERMINAL = {"ADMITTED", "DISCHARGED", "TRANSFERRED", "LEFT", "DIED"}
VITALS = [("8480-6", "Systolic blood pressure", "mmHg", 95, 160), ("8462-4", "Diastolic blood pressure", "mmHg", 60, 100), ("8867-4", "Pulse rate", "/min", 56, 110), ("8310-5", "Body temperature", "°C", 36.0, 39.2), ("2708-6", "Oxygen saturation", "%", 90, 100), ("29463-7", "Body weight", "kg", 4, 95)]


def pick(rng, weighted):
    return rng.choices([w[0] for w in weighted], weights=[w[-1] for w in weighted])[0]


def phone(n):
    return f"+8801{3 + n % 7}{n:08d}"


def person(rng, sex):
    given = rng.choice(D.MALE_NAMES if sex == "male" else D.FEMALE_NAMES)
    family = rng.choice(D.FAMILY_NAMES)
    return given[0], family[0], f"{given[1]} {family[1]}"


class Command(BaseCommand):
    help = "Seeds synthetic Bangladesh demo data: all 64 districts, hospitals with emergency sections, doctors, facility staff and patients."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=1000, help="Records to create for each of doctors, staff and patients (default 1000).")
        parser.add_argument("--password", default="Password123!", help="Sign-in password for every seeded account.")
        parser.add_argument("--force", action="store_true", help="Allow running with DEBUG off. Every account gets the same known password: never use this in production.")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("Refusing to seed known-password accounts while DEBUG is off (use --force only in a throwaway environment).")
        self.n = opts["count"]
        self.password = make_password(opts["password"])
        with transaction.atomic():
            self.seed_specialties()
            self.seed_areas()
            self.seed_facilities()
            self.seed_doctors()
            self.seed_staff()
            self.seed_patients()
            self.seed_ed_visits()
        out = {"districts": Area.objects.filter(level="district").count(), "facilities": Facility.objects.count(), "doctors": Practitioner.objects.filter(registration_number__startswith="BMDC-SEED-").count(),
               "staff": User.objects.filter(email__startswith="staff", email__endswith=DOMAIN).count(), "patients": Patient.objects.filter(account__user__email__endswith=DOMAIN).count(), "ed_visits": EDVisit.objects.count()}
        self.stdout.write(self.style.SUCCESS("Seeded: " + ", ".join(f"{v} {k}" for k, v in out.items())))
        self.stdout.write(f"Sign in as doctor0001@{DOMAIN}, staff0001@{DOMAIN} or patient0001@{DOMAIN} with the chosen password.")

    def seed_specialties(self):
        self.spec = {}
        for code, en, bn, _ in D.SPECIALTIES:
            self.spec[code] = Specialty.objects.get_or_create(code=code, defaults={"name_en": en, "name_bn": bn})[0]
        code, en, bn = D.EMERGENCY_SPECIALTY
        self.spec[code] = Specialty.objects.get_or_create(code=code, defaults={"name_en": en, "name_bn": bn})[0]

    def seed_areas(self):
        self.districts = []  # (district Area, division English name)
        for div_en, (div_bn, districts) in D.DIVISIONS.items():
            div = self._area("division", f"{div_en} Division", f"{div_bn} বিভাগ", None, div_en)
            for en, bn in districts:
                self.districts.append((self._area("district", f"{en} District", f"{bn} জেলা", div, en), div_en))
        self.area_of = {a.name_en.removesuffix(" District"): a for a, _ in self.districts}

    def _area(self, level, name_en, name_bn, parent, slug):
        area = Area.objects.filter(level=level, name_en=name_en).first()
        if not area:
            area = Area(level=level, name_en=name_en, parent=parent)
        area.name_bn, area.parent = name_bn, parent
        area.code = area.code or f"BD-{slug.upper().replace(' ', '-').replace(chr(39), '')}-{level[:4].upper()}"
        area.save()
        return area

    def seed_facilities(self):
        self.facilities = []  # (Facility, district English name, division English name, is_medical_college)
        mch_of = {div: (dist, en, bn) for div, dist, en, bn in D.MEDICAL_COLLEGES}
        for i, (area, div) in enumerate(self.districts):
            dist = area.name_en.removesuffix(" District")
            bn = area.name_bn.removesuffix(" জেলা")
            rng = random.Random(f"facility-{dist}")
            fac, _ = Facility.objects.get_or_create(
                name=f"{dist} District Hospital",
                defaults={"name_bn": f"{bn} জেলা হাসপাতাল", "type": "district_hospital", "area": area, "address": f"Hospital Road, {dist} Sadar, {dist}", "phone": f"+8801{3 + i % 7}{500000 + i:08d}"},
            )
            self.facilities.append((fac, dist, div, False))
            if mch_of[div][0] == dist:
                _, en, mbn = mch_of[div]
                mch, _ = Facility.objects.get_or_create(
                    name=en, defaults={"name_bn": mbn, "type": "medical_college_hospital", "area": area, "address": f"Medical College Road, {dist}", "phone": f"+8801{3 + i % 7}{600000 + i:08d}"},
                )
                self.facilities.append((mch, dist, div, True))
        self.mch_of_div = {div: fac for fac, _, div, mc in self.facilities if mc}
        for fac, dist, _, mc in self.facilities:
            self.seed_sections(fac, mc, random.Random(f"sections-{fac.name}"))

    def seed_sections(self, fac, mc, rng):
        for name, name_bn in D.DEPARTMENTS:
            Department.objects.get_or_create(facility=fac, name=name, defaults={"name_bn": name_bn})
        svc = {code: Service.objects.get_or_create(facility=fac, code=code, defaults={"name": name, "name_bn": bn})[0] for code, name, bn, mc_only in D.SERVICES if mc or not mc_only}
        if CapacityReport.objects.filter(facility=fac, source="seed").exists():
            return
        er_total = rng.randint(24, 40) if mc else rng.randint(8, 18)
        icu_total = rng.randint(14, 30) if mc else rng.randint(4, 10)
        amb = rng.randint(4, 8) if mc else rng.randint(1, 3)
        CapacityReport.objects.create(facility=fac, service=svc["emergency"], source="seed", reported_value={
            "emergency_open": True, "emergency_beds_total": er_total, "emergency_beds_available": rng.randint(0, er_total // 2),
            "resuscitation_bays": 4 if mc else 2, "ambulances_total": amb, "ambulances_available": rng.randint(0, amb), "average_wait_minutes": rng.randint(10, 60)})
        vent = icu_total // 2
        CapacityReport.objects.create(facility=fac, service=svc["icu"], source="seed", reported_value={
            "icu_beds_total": icu_total, "icu_beds_available": rng.randint(0, icu_total // 3), "ventilators_total": vent, "ventilators_available": rng.randint(0, vent // 2)})
        CapacityReport.objects.create(facility=fac, service=svc["outpatient"], source="seed", reported_value={
            "general_beds_total": er_total * 5, "general_beds_available": rng.randint(0, er_total * 2), "opd_wait_minutes": rng.randint(10, 90)})

    def _users(self, kind, start, prefix, prefix_bn):
        """Create the users of one kind that do not exist yet. `make(i, rng)` returns (sex, language, prefix) for index i."""
        have = set(User.objects.filter(email__endswith=DOMAIN, email__startswith=kind).values_list("email", flat=True))
        users, meta = [], []
        for i in range(1, self.n + 1):
            email = f"{kind}{i:04d}@{DOMAIN}"
            if email in have:
                continue
            rng = random.Random(f"{kind}-{i}")
            sex = rng.choice(["male", "female"])
            given, family, bn = person(rng, sex)
            users.append(User(email=email, phone=phone(start + i), display_name=f"{prefix}{given} {family}", preferred_language=rng.choice(["bn", "bn", "en"]), password=self.password, is_active=True))
            meta.append((i, rng, sex, given, family, f"{prefix_bn}{bn}"))
        return User.objects.bulk_create(users), meta

    def seed_doctors(self):
        users, meta = self._users("doctor", 1_000_000, "Dr. ", "ডা. ")
        weighted = [(code, w) for code, _, _, w in D.SPECIALTIES]
        by_district = {}
        for fac, dist, _, _ in self.facilities:
            by_district.setdefault(dist, []).append(fac)
        names = list(by_district)
        practitioners, plans = [], []
        for k, (user, (i, rng, sex, given, family, name_bn)) in enumerate(zip(users, meta)):
            if k < len(self.facilities):
                fac, code = self.facilities[k][0], "emergency_medicine"
            else:
                options = by_district[names[(k - len(self.facilities)) % len(names)]]
                fac, code = options[rng.randrange(len(options))], pick(rng, weighted)
            practitioners.append(Practitioner(registration_number=f"BMDC-SEED-{i:05d}", name=f"Dr. {given} {family}", name_bn=name_bn, user=user))
            plans.append((fac, code))
        practitioners = Practitioner.objects.bulk_create(practitioners)
        roles = PractitionerRole.objects.bulk_create([PractitionerRole(practitioner=p, facility=f, specialty=self.spec[c]) for p, (f, c) in zip(practitioners, plans)])
        Membership.objects.bulk_create([Membership(user=u, facility=f, role="clinician", permissions=EMERGENCY_DOCTOR_PERMISSIONS if c == "emergency_medicine" else DOCTOR_PERMISSIONS) for u, (f, c) in zip(users, plans)])
        Schedule.objects.bulk_create([Schedule(practitioner_role=r, recurrence_rules={"days": ["Sun", "Mon", "Tue", "Wed", "Thu"], "hours": "10:00-13:00"}) for r in roles])
        self.refresh_slots()

    def refresh_slots(self):
        now = timezone.now()
        stale = Schedule.objects.filter(practitioner_role__practitioner__registration_number__startswith="BMDC-SEED-").exclude(slots__start__gte=now).distinct()
        slots, today = [], datetime.now(DHAKA).date()
        for sched in stale:
            for d in range(1, 15):
                day = today + timedelta(days=d)
                if day.weekday() not in WORKDAYS:
                    continue
                for s in range(6):
                    start = datetime.combine(day, time(10, 0), DHAKA) + timedelta(minutes=30 * s)
                    slots.append(Slot(schedule=sched, start=start, end=start + timedelta(minutes=30), state="AVAILABLE"))
        Slot.objects.bulk_create(slots, batch_size=5000)

    def seed_staff(self):
        users, meta = self._users("staff", 2_000_000, "", "")
        perms = {kind: [p for p in codes if p in PERMISSION_CODES] for kind, codes in D.STAFF_KINDS}
        kinds = list(zip(perms, (4, 3, 3, 3)))
        rows = []
        for k, (user, (i, rng, *_)) in enumerate(zip(users, meta)):
            fac = self.facilities[k % len(self.facilities)][0]
            kind = "emergency_desk" if k < len(self.facilities) else pick(rng, kinds)
            rows.append(Membership(user=user, facility=fac, role="facility_staff", permissions=perms[kind]))
        Membership.objects.bulk_create(rows)

    def seed_patients(self):
        users, meta = self._users("patient", 0, "", "")
        now = timezone.now()
        patients, plans = [], []
        for k, (user, (i, rng, sex, given, family, name_bn)) in enumerate(zip(users, meta)):
            area, div = self.districts[(i - 1) % len(self.districts)]
            age_days = int(rng.triangular(30, 90 * 365, 28 * 365))
            patients.append(Patient(given_name=given, family_name=family, name_bn=name_bn, birth_date=(now - timedelta(days=age_days)).date(), sex=sex, phone=user.phone, area=area))
            plans.append((i, area, age_days // 365))
        patients = Patient.objects.bulk_create(patients)
        PatientAccount.objects.bulk_create([PatientAccount(user=u, patient=p) for u, p in zip(users, patients)])

        taken = set(PatientIdentifier.objects.filter(system="system_id").values_list("value", flat=True))
        by_district, ids = {}, []
        for fac, dist, _, _ in self.facilities:
            by_district.setdefault(dist, []).append(fac)
        for p, (i, area, age) in zip(patients, plans):
            sid = generate_system_patient_id()
            while sid in taken:
                sid = generate_system_patient_id()
            taken.add(sid)
            fac = by_district[area.name_en.removesuffix(" District")][-1]
            ids += [PatientIdentifier(patient=p, system="system_id", value=sid, verified=True),
                    PatientIdentifier(patient=p, system="health_id", value=f"{7_000_000_000 + i * 7919:010d}", verified=True),
                    PatientIdentifier(patient=p, system="facility_mrn", value=f"MRN-{fac.pk}-{i:06d}", verified=True)]
            ids.append(PatientIdentifier(patient=p, system="nid", value=f"{(1_990_000_000 + i * 104_729) % 10**10:010d}", verified=True) if age >= 18
                       else PatientIdentifier(patient=p, system="birth_reg", value=f"{p.birth_date.year}{(i - 1) % 64:02d}{i:011d}", verified=True))
        PatientIdentifier.objects.bulk_create(ids, batch_size=2000)
        self.seed_history(patients, plans, by_district)

    def seed_history(self, patients, plans, by_district):
        doctors = {}
        for role in PractitionerRole.objects.filter(practitioner__registration_number__startswith="BMDC-SEED-").select_related("practitioner"):
            doctors.setdefault(role.facility_id, []).append(role.practitioner)
        encounters, obs_plan = [], []
        now = timezone.now()
        for p, (i, area, _) in zip(patients, plans):
            rng = random.Random(f"history-{i}")
            facs = by_district[area.name_en.removesuffix(" District")]
            for _ in range(rng.randint(1, 3)):
                fac = rng.choice(facs)
                start = now - timedelta(days=rng.randint(3, 700), hours=rng.randint(0, 8))
                docs = doctors.get(fac.pk)
                encounters.append(Encounter(patient=p, facility=fac, practitioner=rng.choice(docs) if docs else None, period_start=start, period_end=start + timedelta(minutes=30),
                                            encounter_type="outpatient", reason=rng.choice(D.ENCOUNTER_REASONS)))
                obs_plan.append((p, start, rng))
        encounters = Encounter.objects.bulk_create(encounters, batch_size=2000)
        obs = []
        for enc, (p, start, rng) in zip(encounters, obs_plan):
            for code, name, unit, lo, hi in VITALS:
                value = round(rng.uniform(lo, hi), 1)
                obs.append(ClinicalObservation(encounter=enc, patient=p, code=code, display_name=name, value_numeric=value, unit=unit, observed_date=start))
        ClinicalObservation.objects.bulk_create(obs, batch_size=5000)

    def seed_ed_visits(self):
        domain_users = User.objects.filter(email__endswith=DOMAIN)
        now = timezone.now()
        for fac, dist, div, mc in self.facilities:
            if EDVisit.objects.filter(facility=fac, created_by__email__endswith=DOMAIN).exists():
                continue
            desk = domain_users.filter(memberships__facility=fac, memberships__permissions__contains=["ed.manage"], email__startswith="staff").first()
            patients = list(Patient.objects.filter(area__name_en=f"{dist} District", account__user__email__endswith=DOMAIN)[:12])
            if not patients:
                continue
            rng = random.Random(f"ed-{fac.name}")
            for _ in range(8):
                state = pick(rng, ED_STATES)
                transfer = self.mch_of_div.get(div) if state == "TRANSFERRED" else None
                if state == "TRANSFERRED" and (not transfer or transfer.pk == fac.pk):
                    state, transfer = "ADMITTED", None
                arrived = now - timedelta(minutes=rng.randint(10, 72 * 60))
                triaged = arrived + timedelta(minutes=rng.randint(3, 20)) if state != "ARRIVED" else None
                ended = arrived + timedelta(minutes=rng.randint(40, 600)) if state in TERMINAL else None
                EDVisit.objects.create(
                    facility=fac, patient=rng.choice(patients), state=state, chief_complaint=rng.choice(D.ED_COMPLAINTS), arrived_at=arrived,
                    arrival_mode=rng.choice(["AMBULANCE", "WALK_IN", "WALK_IN", "POLICE", "REFERRAL"]),
                    triage_category=rng.choice(["RED", "ORANGE", "YELLOW", "YELLOW", "GREEN", "GREEN", "BLUE"]) if triaged else None,
                    triaged_at=triaged, triaged_by=desk if triaged else None, disposition_at=ended, transfer_facility=transfer, created_by=desk,
                    disposition_notes="Synthetic seed record." if ended else "", discharge_summary="Discharged after observation. Synthetic seed record." if state == "DISCHARGED" else "")
