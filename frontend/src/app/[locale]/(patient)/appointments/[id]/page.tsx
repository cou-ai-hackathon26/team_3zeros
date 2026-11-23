"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError } from "../../../../../api/client";
import { t, formatDhakaDateTime } from "../../../../../i18n/format";
import { useAppointment, useTransition } from "../../../../../api/queries/hooks";
import { fill } from "../../../../../features/patient/display";
import { ActionBar, type ActionPayload } from "../../../../../components/ActionBar/ActionBar";
import { HandoverTracker } from "../../../../../components/HandoverTracker/HandoverTracker";
import { Column, QueryBoundary } from "../../../../../components/QueryBoundary";
import { SyncBadge } from "../../../../../components/SyncBadge/SyncBadge";
import { useToast } from "../../../../../components/Toast/Toast";
import { Alert } from "../../../../../components/ui/states";
import { DescriptionList } from "../../../../../components/ui/surfaces";

const ConfirmDialog = dynamic(() => import("../../../../../components/ConfirmDialog").then((m) => m.ConfirmDialog), { ssr: false });

/** `/appointments/[id]`: who has the request, and what happens next. Buttons come only from `allowed_actions`. */
export default function AppointmentDetailPage() {
  const locale = usePageLocale(undefined, "bn");
  const id = String(useParams<{ id: string }>()?.id ?? "");
  const query = useAppointment(id);
  const transition = useTransition("appointments");
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState<ActionPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const L = (k: string) => t(locale, `appointments.${k}`);

  async function run(action: string, payload: ActionPayload) {
    const a = query.data;
    if (!a) return;
    setNotice(null);
    try {
      const { pending } = await transition.mutateAsync({
        id: a.id,
        action,
        version: a.version,
        idempotencyKey: payload.idempotencyKey,
        body: { ...(payload.reason ? { reason: payload.reason } : {}), ...(payload.alternateSlotId ? { alternate_slot_id: payload.alternateSlotId } : {}) },
      });
      // A 202 means the change is waiting for a FHIR write: never announce it as done (INV-12).
      if (!pending) toast({ message: t(locale, `toast.appointment.${action}`) });
    } catch (e) {
      const api = e instanceof ApiError ? e : null;
      // 412 and 423: someone else changed it or it is being written. Show the latest, no blind retry.
      if (api && (api.status === 412 || api.status === 423)) await query.refetch();
      setNotice(t(locale, api?.i18nKey ?? "error.generic"));
    }
  }

  return (
    <Column>
      <Link href={`/${locale}/appointments`} className="text-dense text-indigo underline underline-offset-2">{L("back")}</Link>
      <QueryBoundary query={query} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")} notFoundMessage={L("notFound")}>
        {(a) => (
          <>
            <HandoverTracker entity="appointment" currentState={a.state} objectId={a.id} locale={locale} holderName={a.practitioner_name} />
            {(a.fhir_sync_status === "PENDING" || a.pending_action) && (
              <SyncBadge fhirSyncStatus={a.fhir_sync_status as "PENDING"} pendingAction={a.pending_action ?? null} locale={locale} />
            )}
            {notice && <Alert tone="attention" title={notice} />}
            <DescriptionList
              items={[
                { label: t(locale, "holderName.practitioner"), value: a.practitioner_name },
                { label: t(locale, "common.facility"), value: a.facility_name },
                { label: L("when"), value: formatDhakaDateTime(a.slot.start, locale) },
              ]}
            />
            {/* Only shown when the API returns it; the expiry policy is Q-04. */}
            {a.expires_at && <p className="m-0 text-dense text-ink-muted">{fill(L("expires"), { date: formatDhakaDateTime(a.expires_at, locale) })}</p>}
            <ActionBar
              entity="appointment"
              allowedActions={a.allowed_actions}
              isPending={transition.isPending}
              locale={locale}
              onAction={(action, payload) => (action === "cancel" ? setConfirmCancel(payload) : run(action, payload))}
            />
            {a.triage_session_id && (
              <details className="text-dense">
                <summary className="cursor-pointer font-semibold">{L("summary")}</summary>
                <Link href={`/${locale}/triage/summary/${a.triage_session_id}`} className="text-indigo underline underline-offset-2">{L("summary")}</Link>
              </details>
            )}
            {confirmCancel && (
              <ConfirmDialog
                title={L("cancelTitle")}
                description={L("cancelBody")}
                cancelLabel={L("keep")}
                confirmLabel={t(locale, "action.appointment.cancel")}
                onCancel={() => setConfirmCancel(null)}
                onConfirm={() => { const p = confirmCancel; setConfirmCancel(null); run("cancel", p); }}
              />
            )}
          </>
        )}
      </QueryBoundary>
    </Column>
  );
}
