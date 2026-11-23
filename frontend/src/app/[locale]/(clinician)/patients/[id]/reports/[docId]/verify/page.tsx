"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageLocale } from "@/app/usePageLocale";
import { createIntentIdempotencyKey } from "@/api/client";
import { t } from "@/i18n/format";
import { useDocument, useDocumentAction, useExtraction, usePriorResults } from "@/api/queries/hooks";
import type { ApiExtractedField } from "@/api/queries/types";
import { QueryBoundary } from "@/components/QueryBoundary";
import { ReportViewer, type ExtractedCandidateField, type PriorTestResult } from "@/components/ReportViewer/ReportViewer";
import { SyncBadge } from "@/components/SyncBadge/SyncBadge";
import { Button } from "@/components/ui/button";
import { Alert, ErrorState, Skeleton } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/surfaces";

const toViewer = (f: ApiExtractedField): ExtractedCandidateField => ({ id: f.id, name: f.name, value: f.value, unit: f.unit, observedDate: f.observed_date, lab: f.lab, confidence: f.confidence, page: f.page, bbox: f.bbox });

/**
 * `/patients/[id]/reports/[docId]/verify`: confirm OCR values against the original. Verification is
 * FHIR-gated, so after confirming the page shows "saving" until the server says VERIFIED (INV-12).
 */
export default function VerifyReportPage() {
  const locale = usePageLocale(undefined, "en");
  const { id: patientId, docId } = useParams<{ id: string; docId: string }>() as { id: string; docId: string };
  const L = (k: string) => t(locale, `verify.${k}`);
  const doc = useDocument(docId);
  const state = doc.data?.state;
  const extraction = useExtraction(docId, state === "EXTRACTED_UNVERIFIED" || state === "VERIFIED");
  const prior = usePriorResults(patientId);
  const action = useDocumentAction(docId);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "verify" | "reject" | "retry_ocr", fields?: ApiExtractedField[]) {
    setError(null);
    try {
      await action.mutateAsync({ kind, fields, idempotencyKey: createIntentIdempotencyKey() });
      if (kind === "verify") setSubmitted(true);
    } catch {
      setError(L("confirmError"));
    }
  }

  const priorByTest: Record<string, PriorTestResult[]> = {};
  for (const r of prior.data ?? []) {
    const key = (r.display_name || r.code).toLowerCase();
    (priorByTest[key] ??= []).push({ value: r.value, unit: r.unit, date: r.observed_date?.slice(0, 10) ?? "", lab: r.lab });
  }
  const priorFor = (fields: ApiExtractedField[]) => Object.fromEntries(fields.map((f) => [f.name, priorByTest[f.name.toLowerCase()] ?? []]));

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/${locale}/patients/${patientId}`} className="text-dense text-indigo underline underline-offset-2">{L("backToChart")}</Link>
      <PageHeader title={L("title")} context={doc.data?.original_filename} />
      <QueryBoundary query={doc} locale={locale} loadingLabel={L("processing")} errorMessage={L("error")} notFoundMessage={L("notFound")}>
        {(d) => {
          if (["UPLOADED", "OCR_QUEUED", "OCR_RUNNING"].includes(d.state)) return <Skeleton label={L("processing")} />;
          if (d.state === "OCR_FAILED") {
            return <ErrorState message={L("ocrFailed")} locale={locale} retryLabel={L("retry")} onRetry={() => run("retry_ocr")} />;
          }
          if (d.state === "REJECTED") return <Alert tone="attention" title={L("rejected")} />;
          if (d.state === "QUARANTINED") return <Alert tone="attention" title={L("quarantined")} />;
          if (d.state === "VERIFIED") return <Alert tone="positive" title={L("verified")} />;
          return (
            <>
              {(submitted || action.isPending) && <SyncBadge fhirSyncStatus="PENDING" pendingAction="verify" locale={locale} />}
              {error && <Alert tone="attention" title={error} />}
              <QueryBoundary query={extraction} locale={locale} loadingLabel={L("processing")} errorMessage={L("error")}>
                {(x) => (
                  <ReportViewer
                    documentUrl=""
                    filename={d.original_filename}
                    fields={x.fields.map(toViewer)}
                    priorResults={priorFor(x.fields)}
                    locale={locale}
                    onVerify={(edited) => run("verify", edited.map((e) => ({ ...(x.fields.find((f) => f.id === e.id) as ApiExtractedField), value: e.value })))}
                    onReject={() => run("reject")}
                  />
                )}
              </QueryBoundary>
              {submitted && <Button variant="quiet" size="sm" onClick={() => doc.refetch()}>{t(locale, "common.tryAgain")}</Button>}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
