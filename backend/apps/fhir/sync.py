"""
FHIR-gated transition completion (MASTERPLAN §5.8, BACKEND §5.2).

`complete_fhir_transition(obj)` performs the FHIR write for the object's
`pending_action`. On success the engine applies the target state. If FHIR is
unreachable the object stays pending and the caller returns HTTP 202; a worker
retries later (BACKEND §7.2) and calls this same function.

[⏳ ACK] Bundles below use base FHIR R4. The Bangladesh Core profiles are not
applied until Q-01 is answered, and the bundles have not been validated against
a live HAPI server yet (scheduled in BACKEND §14, FHIR tests).
"""
import structlog
from django.conf import settings
from apps.common.exceptions import FhirUnavailableError
from apps.workflow.engine import finalize_fhir_transition
from .client import FhirClient

log = structlog.get_logger(__name__)

REFERRAL_ID_SYSTEM = "urn:medi-waypoint:referral"
DOCUMENT_ID_SYSTEM = "urn:medi-waypoint:document"


def _conditional(resource_type, system, value, resource):
    """Bundle entry that creates the resource once, even if retried."""
    return {
        "resource": resource,
        "request": {
            "method": "POST",
            "url": resource_type,
            "ifNoneExist": f"identifier={system}|{value}",
        },
    }


def referral_bundle(referral) -> dict:
    ident = [{"system": REFERRAL_ID_SYSTEM, "value": str(referral.public_id)}]
    patient_ref = {"reference": f"Patient/{referral.patient.fhir_id}"} if referral.patient.fhir_id else {
        "identifier": {"system": "urn:medi-waypoint:patient", "value": str(referral.patient.public_id)}
    }
    service_request = {
        "resourceType": "ServiceRequest",
        "identifier": ident,
        "status": "active",
        "intent": "order",
        "priority": {"emergency": "stat", "urgent": "urgent"}.get(referral.urgency, "routine"),
        "subject": patient_ref,
        "reasonCode": [{"text": referral.reason}],
    }
    task_status = "completed" if referral.pending_action == "record_outcome" else "requested"
    task = {
        "resourceType": "Task",
        "identifier": [{"system": REFERRAL_ID_SYSTEM + ":task", "value": str(referral.public_id)}],
        "status": task_status,
        "intent": "order",
        "focus": {"identifier": ident[0]},
        "for": patient_ref,
    }
    if referral.pending_action == "record_outcome":
        task["note"] = [{"text": str(referral.outcome)}]
    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [
            _conditional("ServiceRequest", REFERRAL_ID_SYSTEM, referral.public_id, service_request),
            _conditional("Task", REFERRAL_ID_SYSTEM + ":task", referral.public_id, task),
        ],
    }


def document_bundle(document, fields) -> dict:
    ident = {"system": DOCUMENT_ID_SYSTEM, "value": str(document.public_id)}
    patient_ref = {"identifier": {"system": "urn:medi-waypoint:patient", "value": str(document.patient.public_id)}}
    observations = [
        {
            "resource": {
                "resourceType": "Observation",
                "status": "final",
                "code": {"text": f.get("name", "")},
                "subject": patient_ref,
                "valueString": str(f.get("value", "")),
                **({"extension": [{"url": "unit", "valueString": f["unit"]}]} if f.get("unit") else {}),
            },
            "request": {"method": "POST", "url": "Observation"},
        }
        for f in fields
    ]
    report = _conditional("DiagnosticReport", DOCUMENT_ID_SYSTEM, document.public_id, {
        "resourceType": "DiagnosticReport",
        "identifier": [ident],
        "status": "final",
        "code": {"text": "Clinician-verified report values"},
        "subject": patient_ref,
    })
    return {"resourceType": "Bundle", "type": "transaction", "entry": [report, *observations]}


def _build_bundle(obj, extra):
    name = obj._meta.model_name
    if name == "referral":
        return referral_bundle(obj)
    if name == "document":
        return document_bundle(obj, (extra or {}).get("fields", []))
    raise ValueError(f"No FHIR mapping for {name}")


def complete_fhir_transition(obj, actor=None, request_id=None, extra=None):
    """
    Returns True when the FHIR write succeeded and the target state was applied,
    False when FHIR is unavailable and the object stays pending.
    """
    if settings.FHIR_SYNC_MODE != "stub":
        try:
            FhirClient().execute_transaction_bundle(_build_bundle(obj, extra))
        except FhirUnavailableError as exc:
            log.warning("fhir_write_pending", object=str(obj.public_id), action=obj.pending_action, error=str(exc))
            return False
    finalize_fhir_transition(obj, actor=actor, request_id=request_id)
    return True
