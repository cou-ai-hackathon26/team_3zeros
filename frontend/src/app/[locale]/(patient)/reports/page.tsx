"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { createIntentIdempotencyKey } from "../../../../api/client";
import { useChart, useDocumentDownloadLink, useExtraction } from "../../../../api/queries/hooks";
import type { DocumentMeta } from "../../../../api/queries/types";
import { useMe } from "../../../../auth/me";
import { usePageLocale } from "../../../usePageLocale";
import { formatDhakaDateTime, t } from "../../../../i18n/format";
import { Button } from "../../../../components/ui/button";
import { PageHeader, Panel } from "../../../../components/ui/surfaces";
import { Alert, EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";
import { cn } from "../../../../lib/cn";

function ReportCard({ doc, locale }: { doc: DocumentMeta; locale: "bn" | "en" }) {
  const L = (k: string) => t(locale, `patientReports.${k}`);
  const [expanded, setExpanded] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const extraction = useExtraction(doc.id, expanded);
  const download = useDocumentDownloadLink();

  const isVerified = doc.state === "VERIFIED";

  async function handleOpenReport() {
    setDownloadNotice(null);
    setDownloadError(null);
    try {
      await download.mutateAsync({
        documentId: doc.id,
        idempotencyKey: createIntentIdempotencyKey(),
      });
      // Local dev does not persist raw PDF/image bytes in MinIO; confirm audit without broken /content 404.
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
          </p>
        </div>
        <StatusBadge
          entity="document"
          state={doc.state}
          tone={isVerified ? "positive" : "draft"}
          locale={locale}
        />
      </div>

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
        <div className="mt-3 border-t border-line pt-3">
          {extraction.isLoading ? (
            <Skeleton label={L("loading")} className="h-16" />
          ) : extraction.isError ? (
            <ErrorState message={L("error")} locale={locale} variant="inline" onRetry={() => extraction.refetch()} />
          ) : (extraction.data?.fields?.length ?? 0) === 0 ? (
            <p className="m-0 text-dense text-ink-muted">{L("noValues")}</p>
          ) : (
            <dl className="m-0 grid gap-2 sm:grid-cols-2">
              {extraction.data!.fields.map((f) => (
                <div key={f.id} className="rounded-control border border-line bg-surface p-2">
                  <dt className="text-caption font-semibold text-ink-muted">{f.name}</dt>
                  <dd className="m-0 text-body font-semibold tabular-nums text-ink">
                    {f.value}
                    {f.unit ? ` ${f.unit}` : ""}
                  </dd>
                  {f.lab && <span className="text-caption text-ink-muted">{f.lab}</span>}
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}

/** `/reports`: patient's own reports loaded from `GET /patients/{id}/chart` (G-2 resolved). */
export default function PatientReportsPage() {
  const locale = usePageLocale(undefined, "bn");
  const { me } = useMe();
  const patientId = me?.patient_id ?? "";
  const chart = useChart(patientId, Boolean(patientId));
  const reports = chart.data?.documents ?? [];

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        serif
        title={t(locale, "patientReports.title")}
        context={t(locale, "patientReports.context")}
      />

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
            <ReportCard key={doc.id} doc={doc} locale={locale} />
          ))}
        </div>
      )}
    </main>
  );
}
