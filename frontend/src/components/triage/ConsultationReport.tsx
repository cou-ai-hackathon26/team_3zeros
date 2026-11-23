"use client";

import React from "react";
import type { ConsultationReport as Report } from "../../api/queries/types";
import "../../i18n/report";
import { t } from "../../i18n/format";
import type { Locale } from "../../i18n/config";
import { Panel } from "../ui/surfaces";
import { Alert } from "../ui/states";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="m-0 text-dense font-semibold text-ink">{title}</h3>
      <ul className="m-0 list-disc ps-5 text-body text-ink">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** The AI health assessment the patient reviews (D-25). Draft only: always labelled as not a diagnosis. */
export function ConsultationReport({ report, locale }: { report: Report; locale: Locale }) {
  const T = (k: string) => t(locale, `report.${k}`);
  const a = report.health_assessment;
  const level = a.triage_level;
  return (
    <Panel title={T("title")}>
      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-caption text-ink-muted">{T("draftNote")}</p>

        {a.emergency_instructions && (
          <Alert tone="emergency" title={T("emergencyTitle")}>
            {a.emergency_instructions}
          </Alert>
        )}

        <p className="m-0 text-body text-ink">
          <span className="font-semibold">{T("level")}: </span>
          {T(`level${level}`)}
        </p>

        {report.conversation_summary.overview && (
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-dense font-semibold text-ink">{T("overview")}</h3>
            <p className="m-0 text-body text-ink">{report.conversation_summary.overview}</p>
          </div>
        )}
        {a.primary_concern && (
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-dense font-semibold text-ink">{T("concern")}</h3>
            <p className="m-0 text-body text-ink">{a.primary_concern}</p>
          </div>
        )}

        <List title={T("actions")} items={a.recommended_actions} />
        <List title={T("warnings")} items={a.warning_signs} />
        <List title={T("possible")} items={a.possible_explanations.map((e) => `${e.text} (${e.document}${e.page != null ? `, ${T("page")} ${e.page}` : ""})`)} />

        {a.recommended_specialization && (
          <p className="m-0 text-body text-ink">
            <span className="font-semibold">{T("specialty")}: </span>
            {a.recommended_specialization}
          </p>
        )}
        {a.follow_up_guidance && (
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-dense font-semibold text-ink">{T("followUp")}</h3>
            <p className="m-0 text-body text-ink">{a.follow_up_guidance}</p>
          </div>
        )}
        <List title={T("missing")} items={a.missing_information} />

        {a.medical_evidence.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h3 className="m-0 text-dense font-semibold text-ink">{T("evidence")}</h3>
            {a.medical_evidence.map((e, i) => (
              <details key={i} className="text-dense text-ink-muted">
                <summary className="cursor-pointer">
                  {e.document}
                  {e.page != null ? `, ${T("page")} ${e.page}` : ""}
                </summary>
                <p className="m-0 mt-1">{e.relevant_information}</p>
              </details>
            ))}
          </div>
        )}

        {a.requires_clinician_review && <Alert tone="attention" title={T("review")} />}
        <p className="m-0 text-caption text-ink-muted">{a.disclaimer}</p>
      </div>
    </Panel>
  );
}
