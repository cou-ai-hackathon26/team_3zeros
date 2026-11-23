"use client";

import React from "react";
import { usePageLocale } from "../../../usePageLocale";
import { t } from "../../../../i18n/format";
import { asList, useAdminSchedules } from "../../../../api/queries/hooks";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";

export default function AdminSchedulesPage() {
  const locale = usePageLocale(undefined, "en");
  const { data, isLoading, isError, refetch } = useAdminSchedules();
  const schedules = asList(data);

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title={t(locale, "admin.schedules.title")}
        context={t(locale, "admin.schedules.context")}
      />

      {isLoading && <Skeleton label={t(locale, "admin.schedules.loading")} />}
      {isError && (
        <ErrorState
          message={t(locale, "admin.schedules.error")}
          locale={locale}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && schedules.length === 0 && (
        <EmptyState message={t(locale, "admin.schedules.empty")} />
      )}

      {!isLoading && !isError && schedules.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "admin.schedules.practitioner")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.schedules.specialty")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.schedules.facility")}</TableHeaderCell>
              <TableHeaderCell className="text-end">{t(locale, "admin.schedules.slots")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.schedules.rules")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {schedules.map((sched) => (
              <TableRow key={sched.id}>
                <TableCell className="font-semibold text-ink">{sched.practitioner_name}</TableCell>
                <TableCell className="text-ink">{sched.specialty}</TableCell>
                <TableCell className="text-ink-muted">{sched.facility_name}</TableCell>
                <TableCell numeric className="font-medium text-ink">{sched.slots_count}</TableCell>
                <TableCell className="text-caption text-ink-muted">
                  {sched.recurrence_rules && Object.keys(sched.recurrence_rules).length > 0
                    ? JSON.stringify(sched.recurrence_rules)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
