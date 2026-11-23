"use client";

import React from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { usePageLocale } from "../../../usePageLocale";
import { t, formatDhakaDateTime } from "../../../../i18n/format";
import { useAppointments, useConsents } from "../../../../api/queries/hooks";
import { pickNextStep } from "../../../../features/patient/nextStep";
import { APPOINTMENT_IN_PROGRESS, fill } from "../../../../features/patient/display";
import { HandoverTracker } from "../../../../components/HandoverTracker/HandoverTracker";
import { buttonVariants } from "../../../../components/ui/button";
import { ErrorState, Skeleton } from "../../../../components/ui/states";
import { Tile } from "../../../../components/ui/surfaces";

/** `/home`: what is happening with my care, and what do I do next? (APPLICATION_DESIGN §4.2) */
export default function PatientHomePage() {
  const locale = usePageLocale(undefined, "bn");
  const appts = useAppointments({ limit: "100" });
  const consents = useConsents();
  const L = (k: string) => t(locale, `home.${k}`);
  const base = `/${locale}`;

  const loading = appts.isLoading || consents.isLoading;
  const failed = appts.isError || consents.isError;
  const appointments = appts.data?.results ?? [];
  const next = appts.data && consents.data ? pickNextStep(appointments, consents.data) : null;
  const showStart = !!next && next.kind === "none";

  // The "start" actions do not depend on the data, so they work even when a request failed.
  const start = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link href={`${base}/triage?mode=voice`} className={buttonVariants({ variant: showStart ? "on-brand" : "primary", size: "lg", className: "w-full sm:w-auto" })}>
        <Mic aria-hidden className="size-5" />
        {t(locale, "patient.startTalking")}
      </Link>
      <Link href={`${base}/triage?mode=text`} className={showStart ? "text-body text-brand-foreground underline underline-offset-2" : "text-body text-indigo underline underline-offset-2"}>
        {t(locale, "patient.typeInstead")}
      </Link>
    </div>
  );

  let main: React.ReactNode;
  if (loading) {
    main = <Skeleton label={L("loading")} className="h-40" />;
  } else if (failed) {
    // On a light panel: the error text is dark and would be unreadable on the brand tile.
    main = (
      <div className="rounded-panel bg-surface p-4 text-ink">
        <ErrorState message={t(locale, "appointments.error")} locale={locale} variant="inline" onRetry={() => { appts.refetch(); consents.refetch(); }} />
      </div>
    );
  } else if (next && next.kind === "consent") {
    const who = next.request.recipient_practitioner_name || next.request.recipient_facility_name;
    main = (
      <>
        <p className="m-0 font-serif text-title">{fill(L("consent.line"), { name: who })}</p>
        <Link href={`${base}/consents/${next.request.id}`} className={buttonVariants({ variant: "on-brand", size: "lg", className: "w-full sm:w-fit" })}>{L("consent.button")}</Link>
      </>
    );
  } else if (next && next.kind !== "none") {
    const a = next.appointment;
    const key = next.kind;
    const line =
      key === "confirmed"
        ? fill(L("confirmed.line"), { when: formatDhakaDateTime(a.slot.start, locale), facility: a.facility_name })
        : key === "alternate"
          ? L("alternate.line")
          : fill(L("requested.line"), { name: a.practitioner_name });
    main = (
      <>
        <p className="m-0 font-serif text-title">{line}</p>
        <div className="rounded-panel bg-surface p-4 text-ink">
          <HandoverTracker entity="appointment" currentState={a.state} objectId={a.id} locale={locale} holderName={a.practitioner_name} variant="clinical" />
        </div>
        <Link href={`${base}/appointments/${a.id}`} className={buttonVariants({ variant: "on-brand", size: "lg", className: "w-full sm:w-fit" })}>{L(`${key}.button`)}</Link>
      </>
    );
  } else {
    main = (
      <>
        <p className="m-0 font-serif text-title">{t(locale, "patient.homeTitle")}</p>
        {start}
      </>
    );
  }

  const inProgress = appointments.filter((a) => (APPOINTMENT_IN_PROGRESS as readonly string[]).includes(a.state)).length;
  const waiting = consents.data?.pending_requests.filter((r) => r.state === "PENDING").length ?? 0;
  const active = consents.data?.consents.filter((c) => c.state === "ACTIVE").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{L("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-12">
        <Tile tone="brand" className={showStart ? "lg:col-span-12" : "lg:col-span-8"}>
          <section aria-label={L("nextStep")} className="flex flex-col gap-4">{main}</section>
        </Tile>
        {!showStart && (
          <Tile className="flex flex-col gap-3 lg:col-span-4">
            <h2 className="m-0 text-heading font-semibold">{L("describe")}</h2>
            {start}
          </Tile>
        )}
        <Tile href={`${base}/appointments`} className="lg:col-span-4">
          <h2 className="m-0 text-subheading font-semibold">{t(locale, "nav.appointments")}</h2>
          <p className="m-0 mt-1 text-dense text-ink-muted">{inProgress > 0 ? fill(L("appointmentsInProgress"), { n: inProgress }) : L("appointmentsEmpty")}</p>
        </Tile>
        <Tile href={`${base}/reports`} className="lg:col-span-4">
          <h2 className="m-0 text-subheading font-semibold">{t(locale, "nav.reports")}</h2>
          <p className="m-0 mt-1 text-dense text-ink-muted">{L("reportsEmpty")}</p>
        </Tile>
        <Tile href={`${base}/consents`} className="lg:col-span-4">
          <h2 className="m-0 text-subheading font-semibold">{t(locale, "nav.consents")}</h2>
          <p className="m-0 mt-1 text-dense text-ink-muted">
            {waiting > 0 ? fill(L("consentsWaiting"), { n: waiting }) : active > 0 ? fill(L("consentsActive"), { n: active }) : L("consentsEmpty")}
          </p>
        </Tile>
      </div>
      <p className="m-0 text-dense text-ink-muted">{t(locale, "patient.automatedGuideNotice")}</p>
    </div>
  );
}
