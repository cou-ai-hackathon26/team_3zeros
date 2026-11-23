"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { usePageLocale } from "../../../usePageLocale";
import { formatDhakaDateTime, formatTimeAgo, t } from "../../../../i18n/format";
import { asList, useAdminCapacityReports } from "../../../../api/queries/hooks";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";

export default function AdminCapacityPage() {
  const locale = usePageLocale(undefined, "en");
  const { data, isLoading, isError, refetch } = useAdminCapacityReports();
  const reports = asList(data);

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title={t(locale, "admin.capacity.title")}
        context={t(locale, "admin.capacity.context")}
      />

      {/* MASTERPLAN INV-14 Notice */}
      <div className="flex items-start gap-3 rounded-control border border-line bg-sunken p-3 text-dense text-ink-muted">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <p className="m-0">{t(locale, "admin.capacity.notice")}</p>
      </div>

      {isLoading && <Skeleton label={t(locale, "admin.capacity.loading")} />}
      {isError && (
        <ErrorState
          message={t(locale, "admin.capacity.error")}
          locale={locale}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && reports.length === 0 && (
        <EmptyState message={t(locale, "admin.capacity.empty")} />
      )}

      {!isLoading && !isError && reports.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "admin.capacity.facility")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.capacity.reportedAt")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.capacity.summary")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {reports.map((rep) => {
              const timeAgo = formatTimeAgo(rep.reported_at, locale);
              const formattedTime = formatDhakaDateTime(rep.reported_at, locale);
              return (
                <TableRow key={rep.id}>
                  <TableCell className="font-semibold text-ink">{rep.facility_name || rep.facility}</TableCell>
                  <TableCell className="text-dense text-ink">
                    <div>{formattedTime}</div>
                    <div className="text-caption text-ink-muted">({timeAgo})</div>
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {rep.service_capacities && Object.keys(rep.service_capacities).length > 0
                      ? Object.entries(rep.service_capacities).map(([k, v]) => `${k}: ${v}`).join("; ")
                      : rep.general_medicine_beds !== undefined
                        ? `General Medicine beds: ${rep.general_medicine_beds}`
                        : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
