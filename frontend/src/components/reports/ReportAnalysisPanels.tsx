"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ClipboardList,
  FileText,
  HelpCircle,
  Printer,
  ShieldCheck,
} from "lucide-react";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime, t } from "../../i18n/format";
import type { DocumentAiReport, PatientReportHistory } from "../../api/queries/types";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/overlays";
import { cn } from "../../lib/cn";

export function InterpretationBadge({
  interpretation,
  locale,
}: {
  interpretation?: string;
  locale: Locale;
}) {
  const code = (interpretation || "unknown").toLowerCase();
  const label = t(locale, `reportAnalysis.interp.${code}`);
  const isAlert = code === "positive" || code === "abnormal" || code === "high" || code === "low";
  const isOk = code === "negative" || code === "normal";

  if (code === "unknown") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-semibold",
        code === "positive" || code === "abnormal"
          ? "bg-signal-wash text-signal"
          : isAlert
            ? "bg-ochre-wash text-ochre"
            : isOk
              ? "bg-positive-wash text-positive"
              : "bg-sunken text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Displays the OCR + AI + Medical Book RAG analysis report for a single uploaded document.
 * Always marks unverified drafts clearly per INV-7.
 */
export function DocumentAiReportPanel({
  report,
  locale,
  className,
}: {
  report: DocumentAiReport;
  locale: Locale;
  className?: string;
}) {
  const R = (k: string) => t(locale, `reportAnalysis.${k}`);
  const isVerified = Boolean(report.verified);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-panel border p-4",
        isVerified
          ? "border-line bg-surface"
          : "border-[1.5px] border-dashed border-draft bg-draft-wash/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
        <div className="flex items-center gap-2">
          <ClipboardList aria-hidden="true" className="size-4 text-indigo" />
          <h4 className="m-0 text-dense font-semibold text-ink">{R("aiSummaryTitle")}</h4>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-caption font-semibold",
            isVerified ? "bg-positive-wash text-positive" : "bg-ochre-wash text-ochre",
          )}
        >
          {isVerified ? <ShieldCheck aria-hidden="true" className="size-3.5" /> : null}
          <span>{isVerified ? R("verifiedTag") : R("aiDraftTag")}</span>
        </span>
      </div>

      {report.summary && (
        <p className="m-0 text-dense leading-relaxed text-ink">{report.summary}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Positive / Abnormal findings */}
        <div className="flex flex-col gap-2 rounded-control border border-line/80 bg-surface p-3">
          <h5 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-signal">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("positiveHeading")}</span>
          </h5>
          {report.positive_or_abnormal_findings.length === 0 ? (
            <p className="m-0 text-caption text-ink-muted">{R("noPositive")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-dense">
              {report.positive_or_abnormal_findings.map((f, idx) => (
                <li key={`${f.test}-${idx}`} className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-medium text-ink">
                    {f.test}: <strong className="tabular-nums">{f.value}</strong>
                  </span>
                  <InterpretationBadge interpretation={f.status} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Negative / Normal findings */}
        <div className="flex flex-col gap-2 rounded-control border border-line/80 bg-surface p-3">
          <h5 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-positive">
            <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("negativeHeading")}</span>
          </h5>
          {report.negative_or_normal_findings.length === 0 ? (
            <p className="m-0 text-caption text-ink-muted">{R("noNegative")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-dense">
              {report.negative_or_normal_findings.map((f, idx) => (
                <li key={`${f.test}-${idx}`} className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-ink">
                    {f.test}: <span className="font-medium tabular-nums">{f.value}</span>
                  </span>
                  <InterpretationBadge interpretation={f.status} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* RAG Medical Book Citations */}
      {report.rag_references.length > 0 && (
        <div className="flex flex-col gap-2 rounded-control border border-line/80 bg-paper p-3">
          <h5 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-indigo">
            <BookOpenText aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("ragHeading")}</span>
          </h5>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {report.rag_references.map((ref, idx) => (
              <li key={`${ref.document}-${idx}`} className="text-caption leading-relaxed text-ink">
                <span className="font-semibold text-indigo">
                  {ref.document}
                  {ref.page ? ` · ${R("pageLabel")} ${ref.page}` : ""}
                </span>
                {ref.relevant_information && (
                  <span className="ms-1.5 text-ink-muted">{ref.relevant_information}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested follow-up questions */}
      {report.questions_for_doctor.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h5 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-ink-muted">
            <HelpCircle aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("questionsHeading")}</span>
          </h5>
          <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-caption text-ink-muted">
            {report.questions_for_doctor.map((q, idx) => (
              <li key={idx}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {report.disclaimer && (
        <p className="m-0 border-t border-line/60 pt-2 text-caption text-ink-muted">
          {report.disclaimer}
        </p>
      )}
    </div>
  );
}

/**
 * Longitudinal Patient Report History Summary card displayed to sending & receiving
 * senior clinicians (on `/referrals/[id]`, `/referrals/new`, and `/patients/[id]`).
 * Summarizes strictly from analyzed uploaded reports: tests done, positive/abnormal
 * findings, and negative/normal findings.
 */
export function PatientReportHistoryCard({
  history,
  locale,
  className,
  patientName,
}: {
  history: PatientReportHistory;
  locale: Locale;
  className?: string;
  patientName?: string;
}) {
  const R = (k: string) => t(locale, `reportAnalysis.${k}`);
  const [showAll, setShowAll] = useState(false);
  const [openModal, setOpenModal] = useState(false);

  if (!history || history.reports_count === 0) {
    return null;
  }

  return (
    <section
      aria-label={R("historyTitle")}
      className={cn(
        "flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 flex items-center gap-2 text-subheading font-semibold text-ink">
            <FileText aria-hidden="true" className="size-4 text-indigo" />
            <span>{R("historyTitle")}</span>
          </h3>
          <p className="m-0 text-caption text-ink-muted">{R("historySubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-pill bg-indigo-wash px-3 py-1 text-caption font-semibold text-indigo">
            {R("historyCount")
              .replace("{total}", String(history.reports_count))
              .replace("{verified}", String(history.verified_reports_count))}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpenModal(true)}
          >
            <FileText aria-hidden="true" className="me-1.5 size-3.5" />
            {R("viewFullSummary")}
          </Button>
        </div>
      </div>

      {history.concise_summary && (
        <p className="m-0 rounded-control bg-paper px-3.5 py-2.5 text-dense leading-relaxed text-ink">
          {history.concise_summary}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* Positive / Abnormal */}
        <div className="flex flex-col gap-2 rounded-control border border-signal/35 bg-signal-wash/35 p-3">
          <h4 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-signal">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("positiveHeading")}</span>
          </h4>
          {history.positive_or_abnormal.length === 0 ? (
            <p className="m-0 text-caption text-ink-muted">{R("noPositive")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-dense">
              {history.positive_or_abnormal.map((item, idx) => (
                <li
                  key={`${item.document_id}-${item.name}-${idx}`}
                  className="flex flex-col gap-0.5 rounded-control bg-surface px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-semibold text-ink">
                      {item.name}:{" "}
                      <span className="tabular-nums">
                        {item.value}
                        {item.unit ? ` ${item.unit}` : ""}
                      </span>
                    </span>
                    <InterpretationBadge interpretation={item.interpretation} locale={locale} />
                  </div>
                  <span className="text-caption text-ink-muted">
                    {item.filename}
                    {item.date ? ` · ${formatDhakaDateTime(item.date, locale).split(",")[0]}` : ""}
                    {" · "}
                    {item.verified ? R("verifiedTag") : R("aiDraftTag")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Negative / Normal */}
        <div className="flex flex-col gap-2 rounded-control border border-positive/30 bg-positive-wash/35 p-3">
          <h4 className="m-0 flex items-center gap-1.5 text-caption font-semibold text-positive">
            <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{R("negativeHeading")}</span>
          </h4>
          {history.negative_or_normal.length === 0 ? (
            <p className="m-0 text-caption text-ink-muted">{R("noNegative")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-dense">
              {history.negative_or_normal.map((item, idx) => (
                <li
                  key={`${item.document_id}-${item.name}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-1.5 rounded-control bg-surface px-2.5 py-1.5"
                >
                  <span className="text-ink">
                    {item.name}:{" "}
                    <span className="font-medium tabular-nums">
                      {item.value}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </span>
                  <InterpretationBadge interpretation={item.interpretation} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Expandable complete test history table */}
      {history.tests_performed.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="w-fit"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? R("hideAllTests")
              : `${R("showAllTests")} (${history.tests_performed.length})`}
          </Button>
          {showAll && (
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full border-collapse text-dense [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:bg-sunken [&_th]:px-3 [&_th]:py-2 [&_th]:text-start">
                <thead>
                  <tr>
                    <th>{locale === "bn" ? "পরীক্ষা" : "Test"}</th>
                    <th>{locale === "bn" ? "মান" : "Result"}</th>
                    <th>{locale === "bn" ? "অবস্থা" : "Status"}</th>
                    <th>{locale === "bn" ? "উৎস রিপোর্ট" : "Source report"}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.tests_performed.map((item, idx) => (
                    <tr key={`${item.document_id}-${idx}`}>
                      <td className="font-medium text-ink">{item.name}</td>
                      <td className="tabular-nums text-ink">
                        {item.value}
                        {item.unit ? ` ${item.unit}` : ""}
                      </td>
                      <td>
                        <InterpretationBadge interpretation={item.interpretation} locale={locale} />
                      </td>
                      <td className="text-caption text-ink-muted">
                        {item.filename} ({item.verified ? R("verifiedTag") : R("aiDraftTag")})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {history.disclaimer && (
        <p className="m-0 border-t border-line/70 pt-2 text-caption text-ink-muted">
          {history.disclaimer}
        </p>
      )}

      {openModal && (
        <Dialog open onOpenChange={(o) => !o && setOpenModal(false)}>
          <DialogContent
            title={R("historyTitle")}
            description={patientName ? `${patientName} · ${R("historyCount").replace("{total}", String(history.reports_count)).replace("{verified}", String(history.verified_reports_count))}` : R("historySubtitle")}
            closeLabel={t(locale, "common.close")}
            className="md:max-w-3xl"
          >
            <div className="flex flex-col gap-4 pt-2">
              {history.concise_summary && (
                <div className="rounded-control border border-line bg-paper p-3.5 text-dense leading-relaxed text-ink">
                  {history.concise_summary}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-control border border-signal/35 bg-signal-wash/35 p-3">
                  <h4 className="m-0 mb-2 text-caption font-semibold text-signal">{R("positiveHeading")}</h4>
                  {history.positive_or_abnormal.length === 0 ? (
                    <p className="m-0 text-caption text-ink-muted">{R("noPositive")}</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-dense">
                      {history.positive_or_abnormal.map((item, idx) => (
                        <li key={idx} className="flex flex-wrap items-center justify-between gap-1 rounded-control bg-surface px-2.5 py-1.5">
                          <span className="font-semibold text-ink">
                            {item.name}: {item.value}{item.unit ? ` ${item.unit}` : ""}
                          </span>
                          <InterpretationBadge interpretation={item.interpretation} locale={locale} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-control border border-positive/30 bg-positive-wash/35 p-3">
                  <h4 className="m-0 mb-2 text-caption font-semibold text-positive">{R("negativeHeading")}</h4>
                  {history.negative_or_normal.length === 0 ? (
                    <p className="m-0 text-caption text-ink-muted">{R("noNegative")}</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-dense">
                      {history.negative_or_normal.map((item, idx) => (
                        <li key={idx} className="flex flex-wrap items-center justify-between gap-1 rounded-control bg-surface px-2.5 py-1.5">
                          <span className="text-ink">
                            {item.name}: {item.value}{item.unit ? ` ${item.unit}` : ""}
                          </span>
                          <InterpretationBadge interpretation={item.interpretation} locale={locale} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {history.tests_performed.length > 0 && (
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full border-collapse text-dense [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:bg-sunken [&_th]:px-3 [&_th]:py-2 [&_th]:text-start">
                    <thead>
                      <tr>
                        <th>{locale === "bn" ? "পরীক্ষা" : "Test"}</th>
                        <th>{locale === "bn" ? "মান" : "Result"}</th>
                        <th>{locale === "bn" ? "স্বাভাবিক সীমা" : "Reference"}</th>
                        <th>{locale === "bn" ? "অবস্থা" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.tests_performed.map((item, idx) => (
                        <tr key={idx}>
                          <td className="font-medium text-ink">{item.name}</td>
                          <td className="tabular-nums text-ink">{item.value}{item.unit ? ` ${item.unit}` : ""}</td>
                          <td className="text-caption text-ink-muted">{item.reference_range || "—"}</td>
                          <td><InterpretationBadge interpretation={item.interpretation} locale={locale} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {history.disclaimer && (
                <p className="m-0 text-caption text-ink-muted">{history.disclaimer}</p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => typeof window !== "undefined" && window.print()}
                >
                  <Printer aria-hidden="true" className="me-1.5 size-4" />
                  {R("printSummary")}
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={() => setOpenModal(false)}>
                  {t(locale, "common.close")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
