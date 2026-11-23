"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../../api/client";
import { formatDhakaDateTime, formatTimeAgo, t } from "../../../../../i18n/format";
import { useChart, useCreateReferral, useFacilityDirectory, usePatient, usePatientSearch } from "../../../../../api/queries/hooks";
import { pickName } from "../../../../../features/patient/display";
import { patientDisplayName } from "../../../../../components/clinical/QueueDetail";
import { Button } from "../../../../../components/ui/button";
import { Field, Input, Textarea } from "../../../../../components/ui/field";
import { Alert } from "../../../../../components/ui/states";
import { SegmentedControl } from "../../../../../components/ui/selection";
import { PageHeader } from "../../../../../components/ui/surfaces";

type Urgency = "routine" | "urgent" | "emergency";

/** `/referrals/new`: three steps on one page: patient and visit, destination, urgency and reason (APPLICATION_DESIGN §5.3). */
export default function NewReferralPage() {
  const locale = usePageLocale(undefined, "en");
  const router = useRouter();
  const params = useSearchParams();
  const L = (k: string) => t(locale, `referrals.${k}`);
  const [patientId, setPatientId] = useState<string | null>(params?.get("patient") ?? null);
  const [q, setQ] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const patient = usePatient(patientId ?? "", !!patientId);
  const search = usePatientSearch(patientId ? "" : q);
  const chart = useChart(patientId ?? "");
  const facilities = useFacilityDirectory();
  const create = useCreateReferral();
  const encounters = patientId ? chart.data?.encounters ?? [] : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required = t(locale, "common.fieldRequired");
    const next: Record<string, string> = {};
    if (!patientId) next.patient = required;
    if (!facilityId) next.facility = required;
    if (!reason.trim()) next.reason = required;
    setErrors(next);
    if (Object.keys(next).length) return;
    setFormError(null);
    try {
      const ref = await create.mutateAsync({
        idempotencyKey: createIntentIdempotencyKey(),
        body: { patient_id: patientId!, receiver_facility_id: facilityId, urgency, reason: reason.trim(), ...(encounterId ? { encounter_id: encounterId } : {}) },
      });
      router.push(`/${locale}/referrals/${ref.id}`);
    } catch (err) {
      // Field errors from the server bind to their fields; anything else is a form-level message.
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        const map: Record<string, string> = { patient_id: "patient", receiver_facility_id: "facility", reason: "reason" };
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [map[k] ?? k, v.join(" ")])));
      } else setFormError(t(locale, err instanceof ApiError ? err.i18nKey : "error.generic"));
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
      <PageHeader title={L("newTitle")} />
      {formError && <Alert tone="attention" title={L("createError")}>{formError}</Alert>}

      <section aria-label={L("patientStep")} className="flex flex-col gap-3">
        <h2 className="m-0 text-heading font-semibold">{L("patientStep")}</h2>
        {patientId ? (
          <p className="m-0 flex flex-wrap items-center gap-3 text-body">
            {L("selected").replace("{name}", patientDisplayName(patient.data, "…"))}
            <Button variant="quiet" size="sm" onClick={() => { setPatientId(null); setEncounterId(""); }}>{L("change")}</Button>
          </p>
        ) : (
          <>
            <Field label={L("searchPatient")} error={errors.patient} locale={locale}>{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
            {!q.trim() && <p className="m-0 text-dense text-ink-muted">{L("searchHelp")}</p>}
            {q.trim() && search.data?.length === 0 && <p role="status" className="m-0 text-dense text-ink-muted">{L("noPatients")}</p>}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {(search.data ?? []).map((p) => (
                <li key={p.id}><Button variant="secondary" className="w-full justify-start" onClick={() => setPatientId(p.id)}>{patientDisplayName(p, "")}{p.name_bn ? ` (${p.name_bn})` : ""}</Button></li>
              ))}
            </ul>
          </>
        )}
        {patientId && (
          <Field label={L("encounter")} locale={locale}>
            {(p) => (
              <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={encounterId} onChange={(e) => setEncounterId(e.target.value)}>
                <option value="">{L("noEncounter")}</option>
                {encounters.map((enc) => <option key={enc.id} value={enc.id}>{formatDhakaDateTime(enc.period_start, locale)}, {enc.reason || enc.encounter_type}</option>)}
              </select>
            )}
          </Field>
        )}
      </section>

      <section aria-label={L("destinationStep")} className="flex flex-col gap-3">
        <h2 className="m-0 text-heading font-semibold">{L("destinationStep")}</h2>
        <Field label={L("destination")} required error={errors.facility} locale={locale}>
          {(p) => (
            <select {...p} className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">{L("chooseFacility")}</option>
              {(facilities.data ?? []).map((f) => {
                const c = f.latest_capacity;
                return <option key={f.id} value={f.id}>{pickName(locale, f.name, f.name_bn)}{c ? `, ${t(locale, "doctors.reported").replace("{ago}", formatTimeAgo(c.reported_at, locale)).replace("{source}", c.source)}` : ""}</option>;
              })}
            </select>
          )}
        </Field>
      </section>

      <section aria-label={L("urgencyStep")} className="flex flex-col gap-3">
        <h2 className="m-0 text-heading font-semibold">{L("urgencyStep")}</h2>
        <SegmentedControl label={L("urgency")} value={urgency} onValueChange={setUrgency} options={[{ value: "routine", label: L("routine") }, { value: "urgent", label: L("urgent") }, { value: "emergency", label: L("emergency") }]} />
        {urgency === "emergency" && <Link href={`/${locale}/emergency`} className="text-dense text-indigo underline underline-offset-2">{L("useEmergency")}</Link>}
        <Field label={L("reason")} required error={errors.reason} locale={locale}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </section>

      <div className="flex gap-3">
        <Button type="submit" size="lg" loading={create.isPending} loadingLabel={L("creating")}>{L("create")}</Button>
        <Link href={`/${locale}/referrals`} className="flex items-center text-dense text-indigo underline underline-offset-2">{L("cancel")}</Link>
      </div>
    </form>
  );
}
