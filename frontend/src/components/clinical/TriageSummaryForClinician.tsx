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
  const a = sf.report?.health_assessment;
  const fields: Array<[string, unknown]> = [
    [t(locale, "triage.chiefComplaint"), sf.chief_complaint],
    [t(locale, "triage.duration"), sf.duration],
    [t(locale, "triage.severity"), sf.severity],
    [t(locale, "triage.additionalNotes"), sf.additional_notes],
  ];
  return (
    <div className="flex flex-col gap-2">
      {summary.patient_words && <p className="m-0 text-dense">“{summary.patient_words}”</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-dense">
        {fields.filter(([, v]) => v).map(([label, v]) => (
          <React.Fragment key={label}>
            <dt className="font-semibold text-ink-muted">{label}</dt>
            <dd className="m-0">{String(v)}</dd>
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
