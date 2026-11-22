"""Document extraction transitions, mirroring MASTERPLAN §5.4."""
from apps.workflow.engine import Transition, is_system


def is_clinician(actor, obj, payload):
    return bool(
        actor
        and getattr(actor, "is_authenticated", False)
        and actor.memberships.filter(role="clinician").exists()
    )


def is_clinician_or_system(actor, obj, payload):
    return is_system(actor, obj, payload) or is_clinician(actor, obj, payload)


DOCUMENT_TRANSITIONS = {
    "queue_ocr": Transition(source={"UPLOADED"}, target="OCR_QUEUED", permission=is_system),
    "start_ocr": Transition(source={"OCR_QUEUED"}, target="OCR_RUNNING", permission=is_system),
    "ocr_succeeded": Transition(source={"OCR_RUNNING"}, target="EXTRACTED_UNVERIFIED", permission=is_system),
    "ocr_failed": Transition(source={"OCR_RUNNING"}, target="OCR_FAILED", permission=is_system),
    "retry_ocr": Transition(source={"OCR_FAILED"}, target="OCR_QUEUED", permission=is_clinician_or_system),
    "verify": Transition(
        source={"EXTRACTED_UNVERIFIED"},
        target="VERIFIED",
        permission=is_clinician,
        fhir_required=True,
    ),
    "reject": Transition(source={"EXTRACTED_UNVERIFIED"}, target="REJECTED", permission=is_clinician),
    "quarantine": Transition(source={"UPLOADED"}, target="QUARANTINED", permission=is_system),
}
