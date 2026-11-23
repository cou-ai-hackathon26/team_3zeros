"use client";

import React from "react";
import { usePageLocale } from "../../../usePageLocale";
import { t } from "../../../../i18n/format";
import { asList, useAdminFacilities } from "../../../../api/queries/hooks";
import { PageHeader } from "../../../../components/ui/surfaces";
import { Table, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { EmptyState, ErrorState, Skeleton } from "../../../../components/ui/states";

export default function AdminFacilityPage() {
  const locale = usePageLocale(undefined, "en");
  const { data, isLoading, isError, refetch } = useAdminFacilities();
  const facilities = asList(data);

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title={t(locale, "admin.facility.title")}
        context={t(locale, "admin.facility.context")}
      />

      {isLoading && <Skeleton label={t(locale, "admin.facility.loading")} />}
      {isError && (
        <ErrorState
          message={t(locale, "admin.facility.error")}
          locale={locale}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && facilities.length === 0 && (
        <EmptyState message={t(locale, "admin.facility.empty")} />
      )}

      {!isLoading && !isError && facilities.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t(locale, "admin.facility.name")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.facility.type")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.facility.phone")}</TableHeaderCell>
              <TableHeaderCell>{t(locale, "admin.facility.address")}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {facilities.map((fac) => {
              const displayName = locale === "bn" && fac.name_bn ? fac.name_bn : fac.name;
              return (
                <TableRow key={fac.id}>
                  <TableCell className="font-semibold text-ink">
                    <div>{displayName}</div>
                    {fac.name_bn && locale !== "bn" && (
                      <div className="text-caption text-ink-muted">{fac.name_bn}</div>
                    )}
                  </TableCell>
                  <TableCell className="capitalize text-ink-muted">{fac.type ? fac.type.replace(/_/g, " ") : "—"}</TableCell>
                  <TableCell className="tabular-nums text-ink">{fac.phone || "—"}</TableCell>
                  <TableCell className="text-ink-muted">{fac.address || "—"}</TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
