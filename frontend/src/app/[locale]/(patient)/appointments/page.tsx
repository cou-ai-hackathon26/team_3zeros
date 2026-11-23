"use client";

import React from "react";
import Link from "next/link";
import { usePageLocale } from "../../../usePageLocale";
import { t, formatDhakaDateTime } from "../../../../i18n/format";
import { useAppointments } from "../../../../api/queries/hooks";
import type { Appointment } from "../../../../api/queries/types";
import { APPOINTMENT_IN_PROGRESS, appointmentTone } from "../../../../features/patient/display";
import { StatusBadge } from "../../../../components/StatusBadge/StatusBadge";
import { Column, QueryBoundary } from "../../../../components/QueryBoundary";
import { buttonVariants } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/states";
import { ListRow, PageHeader } from "../../../../components/ui/surfaces";

/** `/appointments`: two groups, "In progress" and "Past". No tracker in the list (APPLICATION_DESIGN §4.3). */
export default function PatientAppointmentsPage() {
  const locale = usePageLocale(undefined, "bn");
  const query = useAppointments({ limit: "100" });
  const L = (k: string) => t(locale, `appointments.${k}`);

  const group = (title: string, items: Appointment[]) =>
    items.length === 0 ? null : (
      <section aria-label={title} className="flex flex-col gap-3 rounded-[24px] bg-surface p-5 sm:p-6">
        <h2 className="m-0 text-heading font-semibold text-ink">{title}</h2>
        <ul className="m-0 p-0 [&>li:last-child>a]:border-b-0 [&>li:last-child>div]:border-b-0">
          {items.map((a) => (
            <ListRow
              key={a.id}
              href={`/${locale}/appointments/${a.id}`}
              title={a.practitioner_name}
              meta={`${a.facility_name}, ${formatDhakaDateTime(a.slot.start, locale)}`}
              trailing={<StatusBadge entity="appointment" state={a.state} tone={appointmentTone(a.state)} locale={locale} />}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <Column>
      <PageHeader serif title={L("title")} actions={<Link href={`/${locale}/doctors`} className={buttonVariants({ variant: "secondary" })}>{L("find")}</Link>} />
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
        {(data) => {
          const sorted = [...data.results].sort((a, b) => Date.parse(b.slot.start) - Date.parse(a.slot.start));
          const open = sorted.filter((a) => (APPOINTMENT_IN_PROGRESS as readonly string[]).includes(a.state));
          const past = sorted.filter((a) => !(APPOINTMENT_IN_PROGRESS as readonly string[]).includes(a.state));
          if (sorted.length === 0) {
            return <EmptyState message={L("empty")} action={<Link href={`/${locale}/triage`} className={buttonVariants({ size: "lg" })}>{L("describe")}</Link>} />;
          }
          return <>{group(L("inProgress"), open)}{group(L("past"), past)}</>;
        }}
      </QueryBoundary>
    </Column>
  );
}
