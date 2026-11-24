"""What the referral-draft model is allowed to see (BACKEND §10.3, SECURITY §8, INV-7).

No patient name or contact: age, sex and the clinical facts only. Every fact carries a `source_ref` so each statement in the
draft can cite it. Triage is included only when the patient confirmed it, and is labelled as patient-reported AI summary."""
from typing import List, Tuple


def build_referral_context(referral) -> Tuple[List[str], List[str]]:
    patient = referral.patient
    refs: List[str] = []
    lines = [
        f"Patient: age {patient.estimated_age or 'unknown'}, sex {patient.sex}",
        f"Referral reason (written by the sending doctor): {referral.reason}",
        f"Urgency: {referral.urgency}",
    ]

    from apps.records.models import ClinicalObservation, Encounter
    encounters = Encounter.objects.filter(patient=patient, facility=referral.sender_facility).order_by("-period_start")[:5]
    for enc in encounters:
        ref = f"encounter:{enc.public_id}"
        refs.append(ref)
        lines.append(f"[{ref}] {enc.period_start:%Y-%m-%d} {enc.encounter_type}: {enc.reason or 'no reason recorded'}")
    for obs in ClinicalObservation.objects.filter(patient=patient).order_by("-observed_date")[:25]:
        ref = f"observation:{obs.public_id}"
        refs.append(ref)
        value = obs.value_string or (f"{obs.value_numeric} {obs.unit}".strip() if obs.value_numeric is not None else "")
        lines.append(f"[{ref}] {obs.display_name}: {value}")

    from apps.ai.report_analysis import build_patient_report_history

    history = build_patient_report_history(patient, include_unverified=True)
    for doc_entry in history["documents"]:
        ref = f"document:{doc_entry['id']}"
        refs.append(ref)
        status_label = "verified report" if doc_entry["verified"] else "unverified OCR draft report"
        summary_line = f" — {doc_entry['summary']}" if doc_entry["summary"] else ""
        lines.append(f"[{ref}] {status_label} ({doc_entry['filename']}){summary_line}")

    for item in history["tests_performed"][:30]:
        ref = f"document:{item['document_id']}#page={item['page']}"
        refs.append(ref)
        verify_tag = "verified" if item["verified"] else "unverified draft"
        val_unit = f"{item['value']} {item['unit']}".strip()
        ref_range = f" (ref: {item['reference_range']})" if item["reference_range"] else ""
        lines.append(
            f"[{ref}] Test ({verify_tag}): {item['name']} = {val_unit} [{item['interpretation']}]{ref_range}"
        )

    from apps.triage.models import TriageSession
    session = TriageSession.objects.filter(patient=patient, state="CONFIRMED_BY_PATIENT").select_related("summary").order_by("-ended_at", "-id").first()
    report = ((session.summary.structured_fields or {}).get("report") if session and getattr(session, "summary", None) else None)
    if report:
        ref = f"triage:{session.public_id}"
        refs.append(ref)
        ha, cs = report.get("health_assessment", {}), report.get("conversation_summary", {})
        lines.append(
            f"[{ref}] Patient-reported symptoms from an AI triage conversation the patient confirmed (not a diagnosis): "
            f"{cs.get('overview', '')} Concern: {ha.get('primary_concern', '')}. Symptoms: {', '.join(ha.get('reported_symptoms', []))}. "
            f"AI priority: {ha.get('triage_level', 'not assessed')}."
        )
    return lines, refs
