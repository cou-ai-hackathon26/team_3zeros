"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { usePageLocale } from "../../../usePageLocale";
import { t } from "../../../../i18n/format";
import { PageHeader, Panel } from "../../../../components/ui/surfaces";
import { EmptyState } from "../../../../components/ui/states";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";

export default function PatientReportsPage() {
  const locale = usePageLocale(undefined, "bn");
  // Per G-2: Documents endpoint for patient doesn't exist yet; reports added by doctor appear here.
  const [reports] = useState<Array<{
    id: string;
    title: string;
    lab: string;
    date: string;
    state: "VERIFIED" | "EXTRACTED_UNVERIFIED";
    summary: string;
  }>>([]);

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

      {reports.length === 0 ? (
        <EmptyState message={t(locale, "patientReports.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((rep) => (
            <Panel key={rep.id}>
              <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
                <div>
                  <h3 className="m-0 text-body font-semibold text-ink">{rep.title}</h3>
                  <p className="m-0 text-caption text-ink-muted">{rep.date} — {rep.lab}</p>
                </div>
                <StatusBadge entity="document" state={rep.state} locale={locale} />
              </div>
              <p className="m-0 text-dense text-ink">{rep.summary}</p>
            </Panel>
          ))}
        </div>
      )}
    </main>
  );
}
