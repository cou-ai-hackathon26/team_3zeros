"use client";

import React from "react";
import { usePageLocale } from "../../../usePageLocale";
import { formatDhakaDateTime, t } from "../../../../i18n/format";
import { asList, useAdminStaff } from "../../../../api/queries/hooks";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";

export default function AdminStaffPage() {
  const locale = usePageLocale(undefined, "en");
  const { data, isLoading, isError, refetch } = useAdminStaff();
  const staff = asList(data);

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title={t(locale, "admin.staff.title")}
        context={t(locale, "admin.staff.context")}
      />

      {isLoading && <Skeleton label={t(locale, "admin.staff.loading")} />}
      {isError && (
        <ErrorState
          message={t(locale, "admin.staff.error")}
          locale={locale}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && staff.length === 0 && (
        <EmptyState message={t(locale, "admin.staff.empty")} />
      )}

      {!isLoading && !isError && staff.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "admin.staff.name")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.role")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.contact")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.permissions")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.staff.activeFrom")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {staff.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-semibold text-ink">{member.name}</TableCell>
                <TableCell className="capitalize text-ink">
                  {t(locale, `role.${member.role}` as any) || member.role.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-dense text-ink-muted">
                  {member.phone && <div className="tabular-nums">{member.phone}</div>}
                  {member.email && <div>{member.email}</div>}
                  {!member.phone && !member.email && "—"}
                </TableCell>
                <TableCell className="text-caption text-ink-muted">
                  {member.permissions && member.permissions.length > 0
                    ? member.permissions.join(", ")
                    : "—"}
                </TableCell>
                <TableCell className="text-dense text-ink-muted">
                  {member.active_from ? formatDhakaDateTime(member.active_from, locale) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
