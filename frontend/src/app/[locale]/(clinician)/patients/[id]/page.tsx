"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../../api/client";
import { formatDhakaDateTime, t } from "../../../../../i18n/format";
import { useChart, useCreateEncounter, useDuplicateCandidates, usePatient, useReferrals, useResolveDuplicate, useUploadDocument } from "../../../../../api/queries/hooks";
import { hasRole } from "../../../../../auth/access";
import { useMe } from "../../../../../auth/me";
import { referralTone } from "../../../../../features/clinical/referralDisplay";
import { patientDisplayName } from "../../../../../components/clinical/QueueDetail";
import { QueryBoundary } from "../../../../../components/QueryBoundary";
import { StatusBadge } from "../../../../../components/StatusBadge/StatusBadge";
import { Button, buttonVariants } from "../../../../../components/ui/button";
import { Field, Input } from "../../../../../components/ui/field";
import { Alert, EmptyState } from "../../../../../components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../../components/ui/selection";
import { DescriptionList, ListRow, PageHeader } from "../../../../../components/ui/surfaces";
import { useToast } from "../../../../../components/Toast/Toast";

const ConfirmDialog = dynamic(() => import("../../../../../components/ConfirmDialog").then((m) => m.ConfirmDialog), { ssr: false });

/** `/patients/[id]`: read the chart (APPLICATION_DESIGN §5.3). */
export default function PatientChartPage() {
  const locale = usePageLocale(undefined, "en");
  const router = useRouter();
  const id = String(useParams<{ id: string }>()?.id ?? "");
  const { me } = useMe();
  const clinician = hasRole(me, "clinician");
  const L = (k: string) => t(locale, `patients.${k}`);
  const toast = useToast();
  const patient = usePatient(id);
  const chart = useChart(id);
  const incoming = useReferrals("incoming");
  const outgoing = useReferrals("outgoing");
  const duplicates = useDuplicateCandidates(id);
  const resolve = useResolveDuplicate(id);
  const upload = useUploadDocument();
  const createVisit = useCreateEncounter(id);
  const [confirm, setConfirm] = useState<{ candidateId: string; status: "same_person" | "different" } | null>(null);
  const [visitReason, setVisitReason] = useState("");
  const [showVisit, setShowVisit] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    try {
      const doc = await upload.mutateAsync({ patientId: id, file, idempotencyKey: createIntentIdempotencyKey() });
      router.push(`/${locale}/patients/${id}/reports/${doc.id}/verify`);
    } catch {
      setUploadError(L("uploadError"));
    }
  }

  async function saveVisit(e: React.FormEvent) {
    e.preventDefault();
    const facility = me?.active_facility?.id;
    if (!facility) return;
    await createVisit.mutateAsync({ body: { facility_id: facility, period_start: new Date().toISOString(), reason: visitReason.trim() || undefined }, idempotencyKey: createIntentIdempotencyKey() });
    toast({ message: L("visitSaved") });
    setShowVisit(false);
    setVisitReason("");
  }

  const referrals = [...(incoming.data?.results ?? []), ...(outgoing.data?.results ?? [])].filter((r) => r.patient_id === id);

  return (
    <div className="flex flex-col gap-4">
      <QueryBoundary query={patient} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")} notFoundMessage={L("notFound")}>
        {(p) => (
          <>
            <PageHeader
              title={<>{patientDisplayName(p, "")}{p.name_bn && <span lang="bn" className="ms-2 font-normal text-ink-muted">({p.name_bn})</span>}</>}
              context={[p.birth_date ?? (p.estimated_age ? `${L("age")} ${p.estimated_age}` : null), p.sex].filter(Boolean).join(", ")}
              actions={
                <>
                  {clinician && <Link href={`/${locale}/referrals/new?patient=${id}`} className={buttonVariants()}>{L("refer")}</Link>}
                  <Button variant="secondary" onClick={() => setShowVisit((v) => !v)}>{L("recordVisit")}</Button>
                </>
              }
            />
            {(duplicates.data ?? []).length > 0 && (
              <Alert tone="attention" title={L("duplicate")} action={
                <div className="flex gap-2">
                  {(duplicates.data ?? []).slice(0, 1).map((c) => (
                    <React.Fragment key={c.id}>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ candidateId: c.id, status: "same_person" })}>{L("same")}</Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ candidateId: c.id, status: "different" })}>{L("different")}</Button>
                    </React.Fragment>
                  ))}
                </div>
              } />
            )}
            {showVisit && (
              <form onSubmit={saveVisit} className="flex max-w-md flex-col gap-3 rounded-panel border border-line bg-surface p-4">
                <Field label={L("visitReason")} locale={locale}>{(f) => <Input {...f} value={visitReason} onChange={(e) => setVisitReason(e.target.value)} />}</Field>
                <Button type="submit" loading={createVisit.isPending} className="w-fit">{L("saveVisit")}</Button>
              </form>
            )}
            <Tabs defaultValue="summary">
              <TabsList>
                {(["summary", "visits", "reports", "referrals"] as const).map((k) => <TabsTrigger key={k} value={k}>{L(`tab${k[0].toUpperCase()}${k.slice(1)}`)}</TabsTrigger>)}
              </TabsList>
              <TabsContent value="summary" className="mt-4">
                <DescriptionList items={[
                  { label: L("phone"), value: p.phone || "" },
                  { label: L("identifiers"), value: p.identifiers.map((i) => `${i.system}: ${i.value}`).join(", ") },
                ].filter((i) => i.value)} />
                <QueryBoundary query={chart} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(c) => c.encounters[0] ? (
                    <section className="mt-4"><h2 className="m-0 text-subheading font-semibold">{L("latest")}</h2>
                      <p className="m-0 text-dense">{formatDhakaDateTime(c.encounters[0].period_start, locale)}, {c.encounters[0].reason || c.encounters[0].encounter_type}</p>
                      <ul className="m-0 mt-2 list-none p-0 text-dense">{c.encounters[0].observations.map((o) => <li key={o.id}>{o.display_name}: {o.value_string || o.value_numeric} {o.unit}</li>)}</ul>
                    </section>
                  ) : <EmptyState message={L("noVisits")} />}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="visits" className="mt-4">
                <QueryBoundary query={chart} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(c) => c.encounters.length === 0 ? <EmptyState message={L("noVisits")} /> : (
                    <ul className="m-0 p-0">{c.encounters.map((v) => <ListRow key={v.id} title={`${formatDhakaDateTime(v.period_start, locale)}, ${v.facility_name}`} meta={v.reason || v.encounter_type} />)}</ul>
                  )}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="reports" className="mt-4 flex flex-col gap-3">
                {/* No endpoint lists documents (MASTERPLAN §8.3 G-1/G-2): reports open from the upload that creates them. */}
                <EmptyState message={L("reportsNone")} />
                <Field label={L("upload")} help={L("uploadHelp")} error={uploadError ?? undefined} locale={locale}>
                  {(f) => <input {...f} type="file" accept="application/pdf,image/*" disabled={upload.isPending} onChange={(e) => onFile(e.target.files?.[0])} className="text-dense" />}
                </Field>
              </TabsContent>
              <TabsContent value="referrals" className="mt-4">
                {referrals.length === 0 ? <EmptyState message={L("noReferrals")} /> : (
                  <ul className="m-0 p-0">{referrals.map((r) => <ListRow key={r.id} href={`/${locale}/referrals/${r.id}`} title={r.reason} meta={`${r.sender_facility_name}, ${r.receiver_facility_name}`} trailing={<StatusBadge entity="referral" state={r.state} tone={referralTone(r.state)} locale={locale} />} />)}</ul>
                )}
              </TabsContent>
            </Tabs>
            {confirm && (
              <ConfirmDialog
                title={L("confirmTitle")}
                description={confirm.status === "same_person" ? L("confirmSame") : L("confirmDifferent")}
                cancelLabel={L("cancel")}
                confirmLabel={L("confirm")}
                destructive={false}
                onCancel={() => setConfirm(null)}
                onConfirm={() => { const c = confirm; setConfirm(null); resolve.mutate({ ...c, idempotencyKey: createIntentIdempotencyKey() }); }}
              />
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
