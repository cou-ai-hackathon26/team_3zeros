"""Scoped read selectors for patient documents."""
from .models import Document


def list_patient_documents(patient):
    """Return all non-quarantined documents belonging to `patient`, newest first."""
    return (
        Document.objects.filter(patient=patient)
        .exclude(state="QUARANTINED")
        .order_by("-created_at")
    )
