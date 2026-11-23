from django.db import transaction
from .models import Slot, Appointment
from .transitions import APPOINTMENT_TRANSITIONS
from apps.workflow.engine import execute_transition
from apps.common.exceptions import SlotUnavailableError, NotFoundError, ValidationError
from apps.audit.services import record_audit_event
from apps.identity.models import Patient

def create_appointment_request(user, patient_id, slot_id, triage_session_id=None, request_id=""):
    patient = Patient.objects.filter(public_id=patient_id).first()
    if not patient:
        raise NotFoundError("Patient not found.")

    with transaction.atomic():
        # Lock slot row
        slot = Slot.objects.select_for_update().filter(public_id=slot_id).first()
        if not slot:
            raise NotFoundError("Slot not found.")

        if slot.state != "AVAILABLE":
            raise SlotUnavailableError("Requested appointment slot is no longer available.")

        if triage_session_id:
            from apps.triage.services import validate_and_claim_triage_session
            validate_and_claim_triage_session(
                triage_session_id,
                patient=patient,
                actor=user,
                request_id=request_id,
            )

        # Hold the slot
        slot.state = "HELD"
        slot.save()

        practitioner = slot.schedule.practitioner_role.practitioner
        facility = slot.schedule.practitioner_role.facility

        appointment = Appointment.objects.create(
            patient=patient,
            practitioner=practitioner,
            facility=facility,
            slot=slot,
            state="REQUESTED",
            triage_session_id=triage_session_id,
        )

        record_audit_event(
            action="create",
            object_type="appointment",
            object_id=str(appointment.public_id),
            actor_user=user,
            patient_id=str(patient.public_id),
            request_id=request_id,
        )
        return appointment


def execute_appointment_transition(user, appointment_public_id, action, payload=None, if_match=None, request_id=""):
    payload = payload or {}

    with transaction.atomic():
        appointment = Appointment.objects.select_for_update().filter(public_id=appointment_public_id).first()
        if not appointment:
            raise NotFoundError("Appointment not found.")

        # Set transition table on model instance
        appointment.TRANSITIONS = APPOINTMENT_TRANSITIONS

        # Handle slot state synchronization per MASTERPLAN §5.1 / BACKEND §6.3
        if action == "accept":
            slot = Slot.objects.select_for_update().get(id=appointment.slot_id)
            slot.state = "BOOKED"
            slot.save()
        elif action == "propose_alternate":
            alt_slot_id = payload.get("alternate_slot_id")
            if not alt_slot_id:
                raise ValidationError("alternate_slot_id is required.")
            alt_slot = Slot.objects.select_for_update().filter(public_id=alt_slot_id).first()
            if not alt_slot or alt_slot.state != "AVAILABLE":
                raise SlotUnavailableError("Proposed alternate slot is not available.")

            # Release original slot
            orig_slot = Slot.objects.select_for_update().get(id=appointment.slot_id)
            orig_slot.state = "AVAILABLE"
            orig_slot.save()

            # Hold alternate slot
            alt_slot.state = "HELD"
            alt_slot.save()

            appointment.original_slot = orig_slot
            appointment.slot = alt_slot
        elif action in ("decline", "patient_decline", "cancel", "expire"):
            slot = Slot.objects.select_for_update().get(id=appointment.slot_id)
            slot.state = "AVAILABLE"
            slot.save()
            if action == "decline":
                appointment.decline_reason = payload.get("reason", "")

        appointment, allowed_actions = execute_transition(
            obj=appointment,
            action=action,
            actor=user,
            payload=payload,
            expected_version=if_match,
            request_id=request_id,
        )
        return appointment, allowed_actions

