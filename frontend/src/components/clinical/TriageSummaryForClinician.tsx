"use client";

import React from "react";
import type { TriageSummaryData } from "../../api/queries/types";
import type { Locale } from "../../i18n/config";
import "../../i18n/report";
import { t } from "../../i18n/format";
import { Alert } from "../ui/states";

/** What the patient told the triage assistant and the AI assessment, for the doctor deciding on the request.
 * Shown as an AI draft: the patient's own words come first, the assessment is labelled as not a diagnosis. */
export function TriageSummaryForClinician({ summary, locale }: { summary: TriageSummaryData | null | undefined; locale: Locale }) {
  if (!summary) return null;
  const sf = summary.structured_fields ?? {};
  const edits = (summary.patient_edits as Record<string, unknown>) ?? {};
  const a = sf.report?.health_assessment;
  const fields: Array<{ label: string; value: unknown; wasEdited: boolean }> = [
    { label: t(locale, "triage.chiefComplaint"), value: sf.chief_complaint, wasEdited: Boolean(edits.chief_complaint) },
    { label: t(locale, "triage.duration"), value: sf.duration, wasEdited: Boolean(edits.duration) },
    { label: t(locale, "triage.severity"), value: sf.severity, wasEdited: Boolean(edits.severity) },
    { label: t(locale, "triage.additionalNotes"), value: sf.additional_notes, wasEdited: Boolean(edits.additional_notes) },
  ];
  return (
    <div className="flex flex-col gap-2">
      {summary.patient_words && <p className="m-0 text-dense">“{summary.patient_words}”</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-dense">
        {fields.filter((f) => f.value).map(({ label, value, wasEdited }) => (
          <React.Fragment key={label}>
            <dt className="font-semibold text-ink-muted flex items-center gap-1.5">
              <span>{label}</span>
              {wasEdited && (
                <span className="rounded bg-indigo-wash px-1.5 py-0.5 text-[11px] font-medium text-indigo">
                  {t(locale, "triage.patientEditedBadge")}
                </span>
              )}
            </dt>
            <dd className="m-0">{String(value)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {a && (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <p className="m-0 text-caption text-ink-muted">{t(locale, "report.clinicianNote")}</p>
          {a.emergency_instructions && <Alert tone="emergency" title={t(locale, "report.emergencyTitle")} />}
          <p className="m-0 text-dense"><strong>{t(locale, "report.level")}: </strong>{t(locale, `report.level${a.triage_level}`)}</p>
          {a.warning_signs.length > 0 && <p className="m-0 text-dense"><strong>{t(locale, "report.warnings")}: </strong>{a.warning_signs.join("; ")}</p>}
          {a.recommended_specialization && <p className="m-0 text-dense"><strong>{t(locale, "report.specialty")}: </strong>{a.recommended_specialization}</p>}
          {a.requires_clinician_review && <p className="m-0 text-dense font-semibold">{t(locale, "report.review")}</p>}
        </div>
      )}
    </div>
  );
}
