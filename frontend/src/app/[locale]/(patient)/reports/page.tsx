"use client";

import React, { useRef, useState } from "react";
import { Info, Upload } from "lucide-react";
import { createIntentIdempotencyKey } from "../../../../api/client";
import {
  useChart,
  useDocumentDownloadLink,
  useExtraction,
  useUploadDocument,
} from "../../../../api/queries/hooks";
import type { DocumentMeta } from "../../../../api/queries/types";
import { useMe } from "../../../../auth/me";
import { usePageLocale } from "../../../usePageLocale";
import { formatDhakaDateTime, t } from "../../../../i18n/format";
import { Button } from "../../../../components/ui/button";
import { PageHeader, Panel } from "../../../../components/ui/surfaces";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";
import {
  DocumentAiReportPanel,
  InterpretationBadge,
  PatientReportHistoryCard,
} from "../../../../components/reports/ReportAnalysisPanels";
import { cn } from "../../../../lib/cn";

function ReportCard({
  doc,
  locale,
  defaultExpanded = false,
}: {
  doc: DocumentMeta;
  locale: "bn" | "en";
  defaultExpanded?: boolean;
}) {
  const L = (k: string) => t(locale, `patientReports.${k}`);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const extraction = useExtraction(doc.id, expanded);
  const download = useDocumentDownloadLink();

  const isVerified = doc.state === "VERIFIED";
  const aiReport = extraction.data?.ai_report ?? doc.ai_report ?? null;

  async function handleOpenReport() {
    setDownloadNotice(null);
    setDownloadError(null);
    try {
      const link = await download.mutateAsync({
        documentId: doc.id,
        idempotencyKey: createIntentIdempotencyKey(),
      });
      if (link?.url && typeof window !== "undefined" && typeof window.open === "function") {
        try {
          window.open(link.url, "_blank", "noopener,noreferrer");
        } catch {
          // Ignore popup/jsdom restrictions; audited notice below still confirms access.
        }
      }
      setDownloadNotice(L("downloadAudited"));
    } catch {
      setDownloadError(L("downloadError"));
    }
  }

  return (
    <Panel
      className={cn(
        !isVerified && "border-[1.5px] border-dashed border-draft bg-draft-wash",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <h3 className="m-0 text-body font-semibold text-ink">{doc.original_filename}</h3>
          <p className="m-0 text-caption text-ink-muted">
            {formatDhakaDateTime(doc.created_at, locale)}
            {doc.positive_count && doc.positive_count > 0 ? (
              <span className="ms-2 inline-flex rounded-pill bg-signal-wash px-2 py-0.5 font-semibold text-signal">
                {t(locale, "reportAnalysis.flagsFound").replace("{count}", String(doc.positive_count))}
              </span>
            ) : null}
          </p>
        </div>
        <StatusBadge
          entity="document"
          state={doc.state}
          tone={isVerified ? "positive" : "draft"}
          locale={locale}
        />
      </div>

      {/* Show the full AI + Medical Book Report Summary directly on the card so it is never hidden */}
      {aiReport && (
        <div className="mb-3">
          <DocumentAiReportPanel report={aiReport} locale={locale} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? L("hideValues") : L("viewValues")}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          loading={download.isPending}
          onClick={() => void handleOpenReport()}
        >
          {L("openReport")}
        </Button>
      </div>

      {downloadNotice && (
        <div className="mt-3">
          <Alert tone="info" title={downloadNotice} />
        </div>
      )}
      {downloadError && (
        <div className="mt-3">
          <Alert tone="attention" title={downloadError} />
        </div>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-4 border-t border-line pt-3">
          {extraction.isLoading ? (
            <Skeleton label={L("loading")} className="h-16" />
          ) : extraction.isError ? (
            <ErrorState message={L("error")} locale={locale} variant="inline" onRetry={() => extraction.refetch()} />
          ) : (extraction.data?.fields?.length ?? 0) === 0 ? (
            <p className="m-0 text-dense text-ink-muted">{L("noValues")}</p>
          ) : (
            <dl className="m-0 grid gap-2 sm:grid-cols-2">
              {extraction.data!.fields.map((f) => (
                <div key={f.id} className="rounded-control border border-line bg-surface p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <dt className="text-caption font-semibold text-ink-muted">{f.name}</dt>
                    <InterpretationBadge interpretation={f.interpretation} locale={locale} />
                  </div>
                  <dd className="m-0 mt-0.5 text-body font-semibold tabular-nums text-ink">
                    {f.value}
                    {f.unit ? ` ${f.unit}` : ""}
                  </dd>
                  {(f.reference_range || f.lab) && (
                    <span className="block text-caption text-ink-muted">
                      {[f.reference_range, f.lab].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}

/** `/reports`: patient's own reports with PDF/image upload, OCR extraction, AI + RAG report, and saved doctor history. */
export default function PatientReportsPage() {
  const locale = usePageLocale(undefined, "bn");
  const { me } = useMe();
  const patientId = me?.patient_id ?? "";
  const chart = useChart(patientId, Boolean(patientId));
  const upload = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const reports = chart.data?.documents ?? [];
  const reportHistory = chart.data?.report_history ?? null;

  async function handleFileUpload(file: File | undefined) {
    if (!file || !patientId) return;
    setUploadSuccess(null);
    setUploadError(null);
    try {
      const created = await upload.mutateAsync({
        patientId,
        file,
        idempotencyKey: createIntentIdempotencyKey(),
      });
      setLastUploadedId(created.id);
      setUploadSuccess(t(locale, "patientReports.uploadSuccess"));
      await chart.refetch();
      setTimeout(() => {
        summaryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 120);
    } catch {
      setUploadError(t(locale, "patientReports.uploadError"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        serif
        title={t(locale, "patientReports.title")}
        context={t(locale, "patientReports.context")}
      />

      {/* Patient self-upload panel for PDF or image diagnostic reports */}
      {patientId && (
        <Panel className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-subheading font-semibold text-ink">
              {t(locale, "patientReports.uploadTitle")}
            </h2>
            <p className="m-0 text-dense text-ink-muted">
              {t(locale, "patientReports.uploadHelp")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id="patient-report-file"
              type="file"
              accept="application/pdf,image/*"
              disabled={upload.isPending}
              aria-label={t(locale, "patientReports.uploadButton")}
              onChange={(e) => void handleFileUpload(e.target.files?.[0])}
              className="sr-only"
            />
            <Button
              type="button"
              variant="primary"
              loading={upload.isPending}
              loadingLabel={t(locale, "patientReports.uploading")}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload aria-hidden="true" className="me-1.5 size-4" />
              {t(locale, "patientReports.uploadButton")}
            </Button>
          </div>
          {uploadSuccess && <Alert tone="positive" title={uploadSuccess} />}
          {uploadError && <Alert tone="attention" title={uploadError} />}
        </Panel>
      )}

      {/* Saved Doctor Summary Report persisted under the patient's profile */}
      <div ref={summaryRef}>
        {reportHistory && reportHistory.reports_count > 0 && (
          <PatientReportHistoryCard
            history={reportHistory}
            locale={locale}
            patientName={me?.display_name || undefined}
          />
        )}
      </div>

      <div className="flex items-start gap-3 rounded-control border border-line bg-sunken p-3 text-dense text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <p className="m-0">{t(locale, "patientReports.notice")}</p>
      </div>

      {patientId && chart.isLoading ? (
        <Skeleton label={t(locale, "patientReports.loading")} className="h-32" />
      ) : patientId && chart.isError ? (
        <ErrorState
          message={t(locale, "patientReports.error")}
          locale={locale}
          onRetry={() => chart.refetch()}
        />
      ) : reports.length === 0 ? (
        <EmptyState message={t(locale, "patientReports.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((doc) => (
            <ReportCard
              key={doc.id}
              doc={doc}
              locale={locale}
              defaultExpanded={doc.id === lastUploadedId}
            />
          ))}
        </div>
      )}
    </main>
  );
}
