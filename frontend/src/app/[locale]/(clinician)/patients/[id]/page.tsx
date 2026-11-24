"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../../api/client";
import { formatDhakaDateTime, t } from "../../../../../i18n/format";
import { useChart, useCreateEncounter, useDuplicateCandidates, usePatient, useReferrals, useResolveDuplicate, useUploadDocument, usePatientResults, useCreateClinicalOrder } from "../../../../../api/queries/hooks";
import { hasRole } from "../../../../../auth/access";
import { useMe } from "../../../../../auth/me";
import { referralTone } from "../../../../../features/clinical/referralDisplay";
import { patientDisplayName } from "../../../../../components/clinical/QueueDetail";
import { QueryBoundary } from "../../../../../components/QueryBoundary";
import { StatusBadge } from "../../../../../components/StatusBadge/StatusBadge";
import { Button, buttonVariants } from "../../../../../components/ui/button";
import { Field, Input, Select, Textarea } from "../../../../../components/ui/field";
import { Alert, EmptyState } from "../../../../../components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../../components/ui/selection";
import { DescriptionList, ListRow, PageHeader } from "../../../../../components/ui/surfaces";
import { Dialog, DialogContent } from "../../../../../components/ui/overlays";
import { useToast } from "../../../../../components/Toast/Toast";
import { PatientHeldSummary } from "../../../../../components/patient/PatientHeldSummary";
import { PatientReportHistoryCard } from "../../../../../components/reports/ReportAnalysisPanels";
import { Printer, FlaskConical, AlertTriangle, ShieldCheck } from "lucide-react";

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
  const results = usePatientResults(id);
  const latestEncounter = chart.data?.encounters[0];
  const createOrder = useCreateClinicalOrder(latestEncounter?.id || id);

  const [confirm, setConfirm] = useState<{ candidateId: string; status: "same_person" | "different" } | null>(null);
  const [visitReason, setVisitReason] = useState("");
  const [showVisit, setShowVisit] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showSummaryPrint, setShowSummaryPrint] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderTestName, setOrderTestName] = useState("");
  const [orderPriority, setOrderPriority] = useState<"ROUTINE" | "URGENT" | "STAT">("ROUTINE");
  const [orderNotes, setOrderNotes] = useState("");
  const [advisoryAlert, setAdvisoryAlert] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    try {
      const doc = await upload.mutateAsync({
        patientId: id,
        file,
        encounterId: latestEncounter?.id,
        idempotencyKey: createIntentIdempotencyKey(),
      });
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

  async function handleOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!orderTestName.trim()) return;
    try {
      const res = await createOrder.mutateAsync({
        test_name: orderTestName.trim(),
        priority: orderPriority,
        notes: orderNotes.trim() || undefined,
      });
      if (res.advisory) {
        setAdvisoryAlert(res.advisory);
      }
      toast({ message: L("orderPlaced") });
      setShowOrderModal(false);
      setOrderTestName("");
      setOrderNotes("");
      results.refetch();
    } catch {
      toast({ message: t(locale, "error.validation_error") });
    }
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
                  <Button variant="secondary" onClick={() => setShowOrderModal(true)}>
                    <FlaskConical aria-hidden className="size-4 me-1.5" />
                    {L("orderTest")}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowSummaryPrint(true)}>
                    <Printer aria-hidden className="size-4 me-1.5" />
                    {L("printPatientSummary")}
                  </Button>
                </>
              }
            />
            {advisoryAlert && (
              <Alert
                tone="attention"
                title={L("advisoryTitle")}
                action={<Button size="sm" variant="secondary" onClick={() => setAdvisoryAlert(null)}>{t(locale, "common.close")}</Button>}
              >
                {advisoryAlert}
              </Alert>
            )}
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
                {(["summary", "visits", "results", "reports", "referrals"] as const).map((k) => <TabsTrigger key={k} value={k}>{L(`tab${k[0].toUpperCase()}${k.slice(1)}`)}</TabsTrigger>)}
              </TabsList>
              <TabsContent value="summary" className="mt-4">
                <DescriptionList items={[
                  { label: L("phone"), value: p.phone || "" },
                  { label: L("identifiers"), value: p.identifiers.map((i) => `${i.system}: ${i.value}`).join(", ") },
                ].filter((i) => i.value)} />
                <QueryBoundary query={chart} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(c) => (
                    <div className="flex flex-col gap-4 mt-4">
                      {/* Active Allergies */}
                      <div className="flex flex-col gap-2">
                        <h3 className="m-0 text-dense font-bold text-ink uppercase tracking-wide flex items-center gap-1.5">
                          <AlertTriangle aria-hidden className="size-4 text-signal shrink-0" />
                          {L("activeAllergies")}
                        </h3>
                        {(c.active_allergies && c.active_allergies.length > 0) ? (
                          <ul className="m-0 divide-y divide-line rounded-control border border-signal bg-signal-wash p-2 list-none text-dense">
                            {c.active_allergies.map((a) => (
                              <li key={a.id} className="p-1 font-semibold text-ink">
                                {a.name}: <span className="font-normal text-ink-muted">{a.reaction}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="m-0 text-caption text-ink-muted">{L("noAllergies")}</p>
                        )}
                      </div>

                      {/* Active Medications */}
                      <div className="flex flex-col gap-2">
                        <h3 className="m-0 text-dense font-bold text-ink uppercase tracking-wide">
                          {L("activeMedications")}
                        </h3>
                        {(c.active_medications && c.active_medications.length > 0) ? (
                          <ul className="m-0 divide-y divide-line rounded-control border border-line bg-sunken p-2 list-none text-dense">
                            {c.active_medications.map((m) => (
                              <li key={m.id} className="p-1.5 flex justify-between items-center">
                                <span className="font-medium text-ink">{m.name}</span>
                                <span className="text-caption text-ink-muted">{m.dosage}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="m-0 text-caption text-ink-muted">{L("noMedications")}</p>
                        )}
                      </div>

                      {/* Active Problems */}
                      <div className="flex flex-col gap-2">
                        <h3 className="m-0 text-dense font-bold text-ink uppercase tracking-wide">
                          {L("activeProblems")}
                        </h3>
                        {(c.active_problems && c.active_problems.length > 0) ? (
                          <ul className="m-0 divide-y divide-line rounded-control border border-line bg-sunken p-2 list-none text-dense">
                            {c.active_problems.map((pr, idx) => (
                              <li key={idx} className="p-1.5 flex justify-between items-center">
                                <span className="font-medium text-ink">{pr.reason}</span>
                                <span className="text-caption text-ink-muted">{formatDhakaDateTime(pr.period_start, locale).split(",")[0]}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="m-0 text-caption text-ink-muted">{L("noProblems")}</p>
                        )}
                      </div>

                      {c.report_history && c.report_history.reports_count > 0 && (
                        <PatientReportHistoryCard history={c.report_history} locale={locale} />
                      )}

                      {c.encounters[0] ? (
                        <section className="mt-2 pt-2 border-t border-line">
                          <h2 className="m-0 text-subheading font-semibold">{L("latest")}</h2>
                          <p className="m-0 text-dense">{formatDhakaDateTime(c.encounters[0].period_start, locale)}, {c.encounters[0].reason || c.encounters[0].encounter_type}</p>
                          <ul className="m-0 mt-2 list-none p-0 text-dense">{c.encounters[0].observations.map((o) => <li key={o.id}>{o.display_name}: {o.value_string || o.value_numeric} {o.unit}</li>)}</ul>
                        </section>
                      ) : <EmptyState message={L("noVisits")} />}
                    </div>
                  )}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="visits" className="mt-4">
                <QueryBoundary query={chart} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(c) => c.encounters.length === 0 ? <EmptyState message={L("noVisits")} /> : (
                    <ul className="m-0 p-0">{c.encounters.map((v) => <ListRow key={v.id} title={`${formatDhakaDateTime(v.period_start, locale)}, ${v.facility_name}`} meta={v.reason || v.encounter_type} />)}</ul>
                  )}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="results" className="mt-4">
                <QueryBoundary query={results} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(res) => (
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <h2 className="m-0 text-heading font-semibold text-ink">{L("resultsTimeline")}</h2>
                        <Button variant="secondary" size="sm" onClick={() => setShowOrderModal(true)}>
                          <FlaskConical aria-hidden className="size-4 me-1.5" />
                          {L("orderTest")}
                        </Button>
                      </div>
                      {(!res.timeline || res.timeline.length === 0) ? (
                        <EmptyState message={L("noResults")} />
                      ) : (
                        <div className="flex flex-col gap-4">
                          {res.timeline.map((group) => (
                            <div key={group.test_name} className="rounded-panel border border-line bg-surface p-4 flex flex-col gap-3">
                              <div className="flex justify-between items-center border-b border-line pb-2">
                                <h3 className="m-0 text-subheading font-bold text-ink">
                                  {group.test_name}
                                  {group.code && <span className="ms-2 font-mono text-caption text-ink-muted">({group.code})</span>}
                                </h3>
                                <span className="text-caption font-medium text-ink-muted">{group.results.length} record(s)</span>
                              </div>
                              <div className="divide-y divide-line">
                                {group.results.map((r) => (
                                  <div key={r.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-body font-bold text-ink">{r.value}</span>
                                        <span className="text-caption text-ink-muted">{r.unit}</span>
                                        <span className="inline-flex items-center gap-1 rounded-control bg-positive-wash px-2 py-0.5 text-caption font-medium text-positive">
                                          <ShieldCheck aria-hidden className="size-3" />
                                          {L("verifiedResult")}
                                        </span>
                                      </div>
                                      <span className="text-caption text-ink-muted">{r.lab || "—"}</span>
                                    </div>
                                    <span className="text-dense text-ink font-medium">
                                      {r.observed_date ? formatDhakaDateTime(r.observed_date, locale) : "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="reports" className="mt-4 flex flex-col gap-4">
                <Field label={L("upload")} help={L("uploadHelp")} error={uploadError ?? undefined} locale={locale}>
                  {(f) => <input {...f} type="file" accept="application/pdf,image/*" disabled={upload.isPending} onChange={(e) => onFile(e.target.files?.[0])} className="text-dense" />}
                </Field>
                <QueryBoundary query={chart} locale={locale} loadingLabel={L("loading")} errorMessage={L("error")}>
                  {(c) => {
                    const docs = c.documents ?? [];
                    if (docs.length === 0) {
                      return <EmptyState message={L("reportsNone")} />;
                    }
                    return (
                      <div className="flex flex-col gap-3">
                        {c.report_history && c.report_history.reports_count > 0 && (
                          <PatientReportHistoryCard history={c.report_history} locale={locale} />
                        )}
                        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                          {docs.map((doc) => {
                            const isVerified = doc.state === "VERIFIED";
                            return (
                              <li
                                key={doc.id}
                                className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="m-0 text-body font-semibold text-ink">{doc.original_filename}</p>
                                    <p className="m-0 text-caption text-ink-muted">
                                      {formatDhakaDateTime(doc.created_at, locale)}
                                      {doc.uploaded_by_role === "patient"
                                        ? ` · ${t(locale, "reportAnalysis.uploadedByPatient")}`
                                        : doc.uploaded_by_role === "clinician"
                                          ? ` · ${t(locale, "reportAnalysis.uploadedByClinician")}`
                                          : ""}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {doc.positive_count && doc.positive_count > 0 ? (
                                      <span className="inline-flex rounded-pill bg-signal-wash px-2.5 py-0.5 text-caption font-semibold text-signal">
                                        {t(locale, "reportAnalysis.flagsFound").replace("{count}", String(doc.positive_count))}
                                      </span>
                                    ) : null}
                                    <StatusBadge
                                      entity="document"
                                      state={doc.state}
                                      tone={isVerified ? "positive" : "draft"}
                                      locale={locale}
                                    />
                                  </div>
                                </div>
                                {doc.ai_report?.summary && (
                                  <p className="m-0 rounded-control bg-paper px-3 py-2 text-dense leading-relaxed text-ink">
                                    {doc.ai_report.summary}
                                  </p>
                                )}
                                <div>
                                  <Link
                                    href={`/${locale}/patients/${id}/reports/${doc.id}/verify`}
                                    className={buttonVariants({ variant: isVerified ? "secondary" : "primary", size: "sm" })}
                                  >
                                    {isVerified
                                      ? t(locale, "reportAnalysis.openDetails")
                                      : t(locale, "reportAnalysis.reviewAndVerify")}
                                  </Link>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  }}
                </QueryBoundary>
              </TabsContent>
              <TabsContent value="referrals" className="mt-4">
                {referrals.length === 0 ? <EmptyState message={L("noReferrals")} /> : (
                  <ul className="m-0 p-0">{referrals.map((r) => <ListRow key={r.id} href={`/${locale}/referrals/${r.id}`} title={r.reason} meta={`${r.sender_facility_name}, ${r.receiver_facility_name}`} trailing={<StatusBadge entity="referral" state={r.state} tone={referralTone(r.state)} locale={locale} />} />)}</ul>
                )}
              </TabsContent>
            </Tabs>
            {showOrderModal && (
              <Dialog open onOpenChange={(o) => !o && setShowOrderModal(false)}>
                <DialogContent title={L("orderTestTitle")} closeLabel={t(locale, "common.close")}>
                  <form onSubmit={handleOrder} className="flex flex-col gap-4">
                    <Field label={L("testName")} locale={locale} required>
                      {(f) => <Input {...f} value={orderTestName} onChange={(e) => setOrderTestName(e.target.value)} placeholder="e.g. Serum Creatinine or CBC" />}
                    </Field>
                    <Field label={L("orderPriority")} locale={locale}>
                      {(f) => (
                        <Select {...f} value={orderPriority} onChange={(e) => setOrderPriority(e.target.value as "ROUTINE" | "URGENT" | "STAT")}>
                          <option value="ROUTINE">Routine</option>
                          <option value="URGENT">Urgent</option>
                          <option value="STAT">Stat / Emergency</option>
                        </Select>
                      )}
                    </Field>
                    <Field label={L("orderNotes")} locale={locale}>
                      {(f) => <Textarea {...f} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} />}
                    </Field>
                    <div className="flex justify-end gap-2 pt-2 border-t border-line">
                      <Button type="button" variant="secondary" onClick={() => setShowOrderModal(false)}>
                        {t(locale, "common.close")}
                      </Button>
                      <Button type="submit" variant="primary" loading={createOrder.isPending}>
                        {L("orderTest")}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {showSummaryPrint && (
              <PatientHeldSummary
                patient={p}
                chart={chart.data}
                results={results.data}
                locale={locale}
                facilityName={me?.active_facility?.name}
                onClose={() => setShowSummaryPrint(false)}
              />
            )}
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
