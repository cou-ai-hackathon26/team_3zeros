import hashlib

from .models import KnowledgeDocument


def kb_version() -> str:
    """Short hash of the approved, ready documents (id and version), recorded on each triage session so an answer can be traced
    to the exact knowledge base it was given from. "none" when nothing is approved."""
    rows = KnowledgeDocument.objects.filter(approved=True, status="READY").order_by("id").values_list("public_id", "version")
    joined = "|".join(f"{pid}:{ver}" for pid, ver in rows)
    return hashlib.sha256(joined.encode()).hexdigest()[:12] if joined else "none"
