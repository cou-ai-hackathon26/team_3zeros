"use client";

import React from "react";
import Link from "next/link";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime, t } from "../../i18n/format";
import { useChart, useTriageSession } from "../../api/queries/hooks";
import type { Patient } from "../../api/queries/types";
import { ApiError } from "../../api/client";
import type { QueueEntry } from "../../features/clinical/queue";
import { useCaseActions } from "../../features/clinical/useCaseActions";
import { ActionBar } from "../ActionBar/ActionBar";
import { HandoverTracker } from "../HandoverTracker/HandoverTracker";
import { SyncBadge } from "../SyncBadge/SyncBadge";
import { Alert, ErrorState, Skeleton } from "../ui/states";
import { buttonVariants } from "../ui/button";
import { DescriptionList, Panel } from "../ui/surfaces";

export function patientDisplayName(p: Pick<Patient, "given_name" | "family_name" | "name_bn"> | undefined, fallback: string) {
  return p ? [p.given_name, p.family_name].filter(Boolean).join(" ") : fallback;
}

/** Detail pane for one queue item: who holds it, what it says, and the server's allowed actions. */
export function QueueDetail({ entry, patient, locale, onActed }: { entry: QueueEntry; patient?: Patient; locale: Locale; onActed: () => void }) {
  const isAppt = entry.kind === "appointment";
  const object = (isAppt ? entry.appointment : entry.referral)!;
  const actions = useCaseActions(isAppt ? "appointments" : "referrals", locale);
  const triage = useTriageSession(isAppt ? entry.appointment!.triage_session_id : null);
  const name = patientDisplayName(patient, entry.referral?.patient_name ?? "");

  return (
    <article className="flex min-h-0 flex-col gap-4" aria-label={name}>
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-heading font-semibold">
          {name}
          {patient?.name_bn && <span lang="bn" className="ms-2 font-normal text-ink-muted">({patient.name_bn})</span>}
        </h2>
      </header>

      <HandoverTracker
        entity={isAppt ? "appointment" : "referral"}
        currentState={object.state}
        objectId={object.id}
        locale={locale}
        variant="clinical"
        holderName={isAppt ? undefined : entry.direction === "incoming" ? entry.referral!.receiver_facility_name : entry.referral!.sender_facility_name}
      />
      {(object.fhir_sync_status === "PENDING" || object.pending_action) && (
        <SyncBadge fhirSyncStatus="PENDING" pendingAction={object.pending_action ?? null} locale={locale} />
      )}

      {isAppt ? (
        <>
          <p className="m-0 text-dense text-ink-muted">{formatDhakaDateTime(entry.appointment!.slot.start, locale)}, {entry.appointment!.facility_name}</p>
          {entry.appointment!.triage_session_id && (
            <section aria-label={t(locale, "queue.triage")} className="flex flex-col gap-1">
              <h3 className="m-0 text-subheading font-semibold">{t(locale, "queue.triage")}</h3>
              {triage.isLoading ? <Skeleton /> : triage.isError ? (
                <ErrorState message={t(locale, "queue.error")} locale={locale} variant="inline" onRetry={() => triage.refetch()} />
              ) : (
                <p className="m-0 text-dense">{triage.data?.summary?.patient_words}</p>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="flex flex-col gap-2">
          <p className="m-0 text-dense">{entry.referral!.reason}</p>
          {(entry.referral!.summary?.sections ?? []).map((s, i) => (
            <div key={i} className="text-dense"><strong>{s.title}</strong> {s.text}</div>
          ))}
          <Link href={`/${locale}/referrals/${entry.referral!.id}`} className={buttonVariants({ variant: "secondary", size: "sm", className: "w-fit" })}>{t(locale, "queue.openReferral")}</Link>
        </section>
      )}

      {actions.notice && <Alert tone="attention" title={actions.notice} />}
      <div className="sticky bottom-0 border-t border-line bg-paper py-3">
        <ActionBar
          entity={isAppt ? "appointment" : "referral"}
          allowedActions={object.allowed_actions}
          isPending={actions.isPending}
          locale={locale}
          onAction={async (action, payload) => { if (await actions.run(object, action, payload)) onActed(); }}
        />
      </div>
    </article>
  );
}

/** Right-hand context pane. Its own error state, so a failed chart never blocks a decision. */
export function PatientPane({ patient, patientId, locale }: { patient?: Patient; patientId: string; locale: Locale }) {
  const chart = useChart(patientId);
  const visits = (chart.data?.encounters ?? []).slice(0, 3);
  return (
    <Panel title={t(locale, "queue.patient")}>
      <div className="flex flex-col gap-3">
        {patient && (
          <DescriptionList
            items={[
              { label: t(locale, "welcome.sex"), value: patient.sex },
              { label: t(locale, "welcome.birth"), value: patient.birth_date ?? (patient.estimated_age ? String(patient.estimated_age) : "") },
            ].filter((i) => i.value)}
          />
        )}
        {chart.isLoading ? <Skeleton /> : chart.isError ? (
          <ErrorState message={t(locale, "queue.patientError")} locale={locale} variant="inline" onRetry={() => chart.refetch()} requestId={chart.error instanceof ApiError ? chart.error.requestId : undefined} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-dense">
            {visits.map((v) => <li key={v.id}>{formatDhakaDateTime(v.period_start, locale)}, {v.reason || v.encounter_type}</li>)}
          </ul>
        )}
        <Link href={`/${locale}/patients/${patientId}`} className={buttonVariants({ variant: "secondary", size: "sm", className: "w-fit" })}>{t(locale, "queue.openChart")}</Link>
      </div>
    </Panel>
  );
}
