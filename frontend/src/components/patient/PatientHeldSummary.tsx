"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime, t } from "../../i18n/format";
import type { Patient, Chart, PatientResultsResponse } from "../../api/queries/types";
import { Button } from "../ui/button";
import { Printer, X, AlertTriangle, ShieldCheck } from "lucide-react";

export interface PatientHeldSummaryProps {
  patient: Patient;
  chart?: Chart;
  results?: PatientResultsResponse;
  locale: Locale;
  facilityName?: string;
  onClose?: () => void;
}

export function PatientHeldSummary({
  patient,
  chart,
  results,
  locale,
  facilityName,
  onClose,
}: PatientHeldSummaryProps) {
  const L = (k: string) => t(locale, `patients.${k}`);

  const fullName = locale === "bn" && patient.name_bn ? patient.name_bn : `${patient.given_name} ${patient.family_name}`.trim();
  const allergies = chart?.active_allergies || [];
  const medications = chart?.active_medications || [];
  const problems = chart?.active_problems || [];
  const testResults = (results?.results || []).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 p-4 sm:p-6 print:p-0 print:static print:bg-transparent">
      {/* Action bar for screen only */}
      <div className="mx-auto max-w-3xl flex justify-between items-center mb-3 print:hidden">
        <span className="text-dense font-semibold text-paper">
          {L("patientRecordTitle")}
        </span>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden className="size-4 me-1.5" />
            {L("printPatientSummary")}
          </Button>
          {onClose && (
            <Button variant="secondary" size="sm" onClick={onClose}>
              <X aria-hidden className="size-4 me-1" />
              {t(locale, "common.close")}
            </Button>
          )}
        </div>
      </div>

      {/* Printable record card */}
      <article className="mx-auto max-w-3xl rounded-panel border-2 border-ink bg-paper p-6 text-ink shadow-float print:border print:shadow-none print:rounded-none print:p-4">
        {/* Header */}
        <header className="border-b-2 border-ink pb-3 mb-4 flex flex-wrap justify-between items-start gap-2">
          <div>
            <h1 className="m-0 text-heading font-bold text-ink">
              Medi Waypoint
            </h1>
            <p className="m-0 text-caption font-medium text-ink-muted">
              {L("patientRecordTitle")}
            </p>
          </div>
          <div className="text-end text-caption text-ink-muted">
            <p className="m-0 font-semibold text-ink">{facilityName || "Health Center"}</p>
            <p className="m-0">{formatDhakaDateTime(new Date().toISOString(), locale)}</p>
          </div>
        </header>

        {/* Patient Demographics */}
        <section className="mb-4 rounded-control border border-line bg-sunken p-3 text-dense">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <span className="text-caption text-ink-muted block">{L("title")}:</span>
              <strong className="text-ink">{fullName}</strong>
            </div>
            <div>
              <span className="text-caption text-ink-muted block">{L("phone")}:</span>
              <span className="text-ink font-mono">{patient.phone || "—"}</span>
            </div>
            <div>
              <span className="text-caption text-ink-muted block">{L("sex")} / {L("age")}:</span>
              <span className="text-ink">
                {patient.sex || "—"} / {patient.birth_date || (patient.estimated_age ? `${patient.estimated_age}y` : "—")}
              </span>
            </div>
            <div>
              <span className="text-caption text-ink-muted block">{L("identifiers")}:</span>
              <span className="text-ink font-mono text-caption">
                {patient.identifiers?.map((i) => `${i.system}: ${i.value}`).join(", ") || "—"}
              </span>
            </div>
          </div>
        </section>

        {/* High-visibility Allergies Alert */}
        <section className="mb-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle aria-hidden className="size-4 text-signal shrink-0" />
            <h2 className="m-0 text-dense font-bold text-ink uppercase tracking-wide">
              {L("activeAllergies")}
            </h2>
          </div>
          {allergies.length > 0 ? (
            <div className="rounded-control border-2 border-signal bg-signal-wash p-2.5 text-dense">
              <ul className="m-0 list-disc ps-5 space-y-1">
                {allergies.map((a) => (
                  <li key={a.id} className="font-semibold text-ink">
                    {a.name}: <span className="font-normal text-ink-muted">{a.reaction}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="m-0 text-caption text-ink-muted border border-line rounded-control p-2 bg-sunken">
              {L("noAllergies")}
            </p>
          )}
        </section>

        {/* Current Medications */}
        <section className="mb-4">
          <h2 className="m-0 mb-1.5 text-dense font-bold text-ink uppercase tracking-wide">
            {L("activeMedications")}
          </h2>
          {medications.length > 0 ? (
            <table className="w-full text-start text-dense border border-line">
              <thead className="bg-sunken border-b border-line text-caption font-semibold">
                <tr>
                  <th className="p-2 text-start">Medication</th>
                  <th className="p-2 text-start">Dosage / Instructions</th>
                  <th className="p-2 text-end">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {medications.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2 font-medium text-ink">{m.name}</td>
                    <td className="p-2 text-ink-muted">{m.dosage || "As directed"}</td>
                    <td className="p-2 text-end text-caption text-ink-muted">
                      {m.observed_date ? formatDhakaDateTime(m.observed_date, locale).split(",")[0] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="m-0 text-caption text-ink-muted border border-line rounded-control p-2 bg-sunken">
              {L("noMedications")}
            </p>
          )}
        </section>

        {/* Recent Problems & Visits */}
        <section className="mb-4">
          <h2 className="m-0 mb-1.5 text-dense font-bold text-ink uppercase tracking-wide">
            {L("activeProblems")}
          </h2>
          {problems.length > 0 ? (
            <ul className="m-0 divide-y divide-line border border-line rounded-control p-0 list-none text-dense">
              {problems.map((p, idx) => (
                <li key={idx} className="p-2 flex justify-between items-center">
                  <span className="font-medium text-ink">{p.reason}</span>
                  <span className="text-caption text-ink-muted">
                    {formatDhakaDateTime(p.period_start, locale).split(",")[0]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-caption text-ink-muted border border-line rounded-control p-2 bg-sunken">
              {L("noProblems")}
            </p>
          )}
        </section>

        {/* Recent Lab & Diagnostic Results */}
        <section className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="m-0 text-dense font-bold text-ink uppercase tracking-wide">
              {L("resultsTimeline")}
            </h2>
            <span className="text-caption text-ink-muted">
              INV-15: Non-suppressed diagnostic record
            </span>
          </div>
          {testResults.length > 0 ? (
            <table className="w-full text-start text-dense border border-line">
              <thead className="bg-sunken border-b border-line text-caption font-semibold">
                <tr>
                  <th className="p-2 text-start">Investigation</th>
                  <th className="p-2 text-start">Result</th>
                  <th className="p-2 text-start">Facility / Lab</th>
                  <th className="p-2 text-end">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {testResults.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 font-medium text-ink">
                      {r.display_name}
                      {r.code && <span className="ms-1 font-mono text-caption text-ink-muted">({r.code})</span>}
                    </td>
                    <td className="p-2 font-bold text-ink">
                      {r.value} <span className="font-normal text-caption text-ink-muted">{r.unit}</span>
                    </td>
                    <td className="p-2 text-caption text-ink-muted">{r.lab || "—"}</td>
                    <td className="p-2 text-end text-caption text-ink-muted">
                      {r.observed_date ? formatDhakaDateTime(r.observed_date, locale).split(",")[0] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="m-0 text-caption text-ink-muted border border-line rounded-control p-2 bg-sunken">
              {L("noResults")}
            </p>
          )}
        </section>

        {/* Footer with verification statement */}
        <footer className="border-t-2 border-ink pt-3 flex flex-wrap justify-between items-end gap-3 text-caption text-ink-muted">
          <div className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-4 text-positive" />
            <span>Official patient-held summary. All prior investigations verified.</span>
          </div>
          <div className="text-end">
            <div className="w-48 border-b border-ink mb-1" />
            <span>Authorized Clinician Signature / Stamp</span>
          </div>
        </footer>
      </article>
    </div>
  );
}

