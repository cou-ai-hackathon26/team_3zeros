import uuid
from django.db import transaction
from django.utils import timezone
from apps.organizations.models import Facility
from apps.identity.models import Patient
from apps.records.models import Encounter, ClinicalObservation
from apps.audit.services import record_audit_event
from apps.common.exceptions import NotFoundError, ValidationError
from apps.workflow.engine import execute_transition
from .models import EDVisit
from .transitions import ED_VISIT_TRANSITIONS

VITAL_SPECS = {
    "pulse": ("8867-4", "Heart rate", "bpm"),
    "systolic": ("8480-6", "Systolic blood pressure", "mmHg"),
    "diastolic": ("8462-4", "Diastolic blood pressure", "mmHg"),
    "temperature": ("8310-5", "Body temperature", "°C"),
    "respiratory_rate": ("9279-1", "Respiratory rate", "/min"),
    "spo2": ("2708-6", "Oxygen saturation (SpO2)", "%"),
}

def record_vitals_observations(encounter, patient, vitals_dict):
    if not vitals_dict or not isinstance(vitals_dict, dict):
        return []
    obs_list = []
    now = timezone.now()
    for key, (code, display_name, unit) in VITAL_SPECS.items():
        val = vitals_dict.get(key)
        if val is not None and str(val).strip() != "":
            try:
                num = float(val)
                obs = ClinicalObservation.objects.create(
                    encounter=encounter,
                    patient=patient,
                    code=code,
                    display_name=display_name,
                    value_numeric=num,
                    value_string=str(val),
                    unit=unit,
                    observed_date=now,
                )
                obs_list.append(obs)
            except (ValueError, TypeError):
                continue
    return obs_list

def create_ed_visit(user, validated_data, request_id=""):
    facility_id = validated_data.get("facility_id")
    facility = None
    if facility_id:
        facility = Facility.objects.filter(public_id=facility_id).first()
    elif user and user.is_authenticated:
        membership = user.memberships.first()
        facility = membership.facility if membership else None

    if not facility:
        raise ValidationError(
            "A facility is required to register an emergency department visit.",
            field_errors={"facility_id": ["Facility not found."]},
        )

    patient_id = validated_data.get("patient_id")
    patient = None
    if patient_id:
        patient = Patient.objects.filter(public_id=patient_id).first()
        if not patient:
            raise NotFoundError("Patient not found.")
    else:
        name = validated_data.get("patient_name") or "Emergency Patient"
        name_parts = name.strip().split(" ", 1)
        given_name = name_parts[0]
        family_name = name_parts[1] if len(name_parts) > 1 else "Unknown"
        patient = Patient.objects.create(
            given_name=given_name,
            family_name=family_name,
            name_bn=validated_data.get("patient_name_bn") or "জরুরী রোগী",
            sex=validated_data.get("patient_sex") or "unknown",
            phone=validated_data.get("patient_phone") or None,
        )

    with transaction.atomic():
        arrived_at = validated_data.get("arrived_at") or timezone.now()
        chief_complaint = validated_data.get("chief_complaint", "").strip()

        encounter = Encounter.objects.create(
            patient=patient,
            facility=facility,
            encounter_type="emergency",
            period_start=arrived_at,
            reason=chief_complaint,
        )

        vitals = validated_data.get("vitals")
        if vitals:
            record_vitals_observations(encounter, patient, vitals)

        visit = EDVisit.objects.create(
            facility=facility,
            patient=patient,
            encounter=encounter,
            chief_complaint=chief_complaint,
            arrival_mode=validated_data.get("arrival_mode", "WALK_IN"),
            arrived_at=arrived_at,
            created_by=user if user and user.is_authenticated else None,
        )

        record_audit_event(
            action="create",
            object_type="edvisit",
            object_id=str(visit.public_id),
            actor_user=user if user and user.is_authenticated else None,
            patient_id=str(patient.public_id),
            request_id=request_id,
        )

        return visit

def execute_ed_visit_transition(user, visit_public_id, action, payload=None, if_match=None, request_id=""):
    payload = payload or {}

    with transaction.atomic():
        visit = EDVisit.objects.select_for_update().filter(public_id=visit_public_id).first()
        if not visit:
            raise NotFoundError("Emergency visit not found.")

        visit.TRANSITIONS = ED_VISIT_TRANSITIONS

        if action == "triage":
            category = payload.get("category") or payload.get("triage_category")
            if not category:
                raise ValidationError("Triage category is required.", field_errors={"category": ["Required"]})
            visit.triage_category = category
            visit.triaged_at = timezone.now()
            visit.triaged_by = user if user and user.is_authenticated else None
            vitals = payload.get("vitals")
            if vitals and visit.encounter:
                record_vitals_observations(visit.encounter, visit.patient, vitals)
        elif action == "admit":
            visit.disposition_at = timezone.now()
            visit.disposition_notes = payload.get("notes", "")
        elif action == "discharge":
            visit.disposition_at = timezone.now()
            visit.discharge_summary = payload.get("summary") or payload.get("discharge_summary", "")
            visit.disposition_notes = payload.get("notes", "")
        elif action == "transfer":
            visit.disposition_at = timezone.now()
            transfer_fac_id = payload.get("transfer_facility_id")
            if transfer_fac_id:
                fac = Facility.objects.filter(public_id=transfer_fac_id).first()
                if fac:
                    visit.transfer_facility = fac
            visit.disposition_notes = payload.get("notes", "")
        elif action in ("mark_left", "mark_died"):
            visit.disposition_at = timezone.now()
            visit.disposition_notes = payload.get("notes", "")

        clean_payload = {
            k: str(v) if isinstance(v, uuid.UUID) else v
            for k, v in payload.items()
        }

        visit, allowed_actions = execute_transition(
            obj=visit,
            action=action,
            actor=user,
            payload=clean_payload,
            expected_version=if_match,
            request_id=request_id,
        )

        return visit, allowed_actions
