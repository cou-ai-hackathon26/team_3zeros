"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageLocale } from "../../../../usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../../../../api/client";
import { formatDhakaDateTime, formatTimeAgo, t } from "../../../../../i18n/format";
import { useChart, useCreateReferral, useFacilityDirectory, usePatient, usePatientSearch, useUploadDocument } from "../../../../../api/queries/hooks";
import { useMe } from "../../../../../auth/me";
import { pickName } from "../../../../../features/patient/display";
import { patientDisplayName } from "../../../../../components/clinical/QueueDetail";
import { PatientReportHistoryCard } from "../../../../../components/reports/ReportAnalysisPanels";
import { ReferralSlip } from "../../../../../components/chw/ReferralSlip";
import { unifiedOfflineStore } from "../../../../../offline/store";
import type { DecryptedUnifiedItem, OfflinePatientPayload } from "../../../../../offline/unifiedQueue";
import { Button } from "../../../../../components/ui/button";
import { Field, Input, Textarea } from "../../../../../components/ui/field";
import { Alert } from "../../../../../components/ui/states";
import { SegmentedControl } from "../../../../../components/ui/selection";
import { PageHeader } from "../../../../../components/ui/surfaces";

type Urgency = "routine" | "urgent" | "emergency";
type AllergyStatus = "unknown" | "none_known" | "known";

interface OfflineReferralSaved {
  provisionalCode: string;
  createdAt: string;
  reason: string;
  urgency: Urgency;
  receivingFacilityName: string;
  patientName: string;
  patientSystemId: string | null;
  hasPatientDependency: boolean;
}

/** `/referrals/new`: patient (online or offline), destination, urgency, reason & optional clinical context (APPLICATION_DESIGN §5.3 + Phase 3D). */
export default function NewReferralPage() {
  const locale = usePageLocale(undefined, "en");
  const router = useRouter();
  const params = useSearchParams();
  const { me } = useMe();
  const L = (k: string) => t(locale, `referrals.${k}`);
  const CL = (k: string) => t(locale, `chw.referral.${k}`);

  const initialOfflineQueueId = params?.get("offlinePatientQueueId") ?? null;
  const initialLocalPatientRef = params?.get("localPatientRef") ?? null;
  const triageSessionId = params?.get("triage_session_id") ?? null;

  const [patientId, setPatientId] = useState<string | null>(params?.get("patient") ?? null);
  const [offlinePatientQueueId, setOfflinePatientQueueId] = useState<string | null>(initialOfflineQueueId);
  const [localPatientRef, setLocalPatientRef] = useState<string | null>(initialLocalPatientRef);
  const [offlinePatientName, setOfflinePatientName] = useState<string>("");
  const [offlinePatients, setOfflinePatients] = useState<DecryptedUnifiedItem<OfflinePatientPayload>[]>([]);

  const [q, setQ] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [reason, setReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [observations, setObservations] = useState("");
  const [allergyStatus, setAllergyStatus] = useState<AllergyStatus>("unknown");
  const [allergyDetails, setAllergyDetails] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState<OfflineReferralSaved | null>(null);
  const [savingOffline, setSavingOffline] = useState(false);

  const intentKeyRef = useRef<string>(createIntentIdempotencyKey());

  const patient = usePatient(patientId ?? "", !!patientId && !offlinePatientQueueId);
  const search = usePatientSearch(patientId || offlinePatientQueueId ? "" : q);
  const chart = useChart(patientId && !offlinePatientQueueId ? patientId : "");
  const facilities = useFacilityDirectory();
  const create = useCreateReferral();
  const uploadDoc = useUploadDocument();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const encounters = patientId && !offlinePatientQueueId ? chart.data?.encounters ?? [] : [];
  const reportHistory = patientId && !offlinePatientQueueId ? chart.data?.report_history ?? null : null;

  async function onAttachReport(file: File | undefined) {
    if (!file || !patientId || offlinePatientQueueId) return;
    setUploadError(null);
    try {
      await uploadDoc.mutateAsync({
        patientId,
        file,
        encounterId: encounterId || encounters[0]?.id,
        idempotencyKey: createIntentIdempotencyKey(),
      });
      await chart.refetch();
    } catch {
      setUploadError(t(locale, "patients.uploadError"));
    }
  }

  // Load any offline-created patients for the signed-in user so CHWs can link a referral to them
  useEffect(() => {
    if (!me?.id) return;
    let mounted = true;
    unifiedOfflineStore.listItemsForUser(me.id).then((items) => {
      if (!mounted) return;
      const pats = items.filter(
        (i): i is DecryptedUnifiedItem<OfflinePatientPayload> =>
          i.kind === "patient_create" && i.payload !== null
      );
      setOfflinePatients(pats);
      if (offlinePatientQueueId) {
        const matched = pats.find((p) => p.queueId === offlinePatientQueueId);
        if (matched?.payload) {
          setOfflinePatientName(matched.payload.given_name);
          if (!localPatientRef && matched.tempEntityRef) {
            setLocalPatientRef(matched.tempEntityRef);
          }
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [me?.id, offlinePatientQueueId, localPatientRef]);

  function buildSummary(): Record<string, unknown> | undefined {
    const summary: Record<string, unknown> = {};
    if (symptoms.trim()) summary.symptoms = symptoms.trim();
    if (observations.trim()) summary.observations = observations.trim();
    if (allergyStatus !== "unknown" || allergyDetails.trim()) {
      summary.allergy_status = allergyStatus;
      if (allergyStatus === "known" && allergyDetails.trim()) {
        summary.allergies = allergyDetails.trim();
      }
    }
    return Object.keys(summary).length > 0 ? summary : undefined;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required = t(locale, "common.fieldRequired");
    const next: Record<string, string> = {};
    const effectivePatientId = offlinePatientQueueId ? localPatientRef : patientId;
    if (!effectivePatientId) next.patient = required;
    if (!facilityId) next.facility = required;
    if (!reason.trim()) next.reason = required;
    setErrors(next);
    if (Object.keys(next).length) return;
    setFormError(null);

    const summary = buildSummary();
    const selectedFacility = (facilities.data ?? []).find((f) => f.id === facilityId);
    const receivingName = selectedFacility
      ? pickName(locale, selectedFacility.name, selectedFacility.name_bn)
      : facilityId;

    const mustQueueOffline =
      Boolean(offlinePatientQueueId) ||
      (typeof navigator !== "undefined" && navigator.onLine === false);

    async function enqueueStandardOffline() {
      setSavingOffline(true);
      try {
        const queued = await unifiedOfflineStore.enqueueStandardReferral({
          ownerUserId: me?.id ?? "anonymous-local",
          facilityId: me?.active_facility?.id ?? "unknown-facility",
          dependsOnQueueId: offlinePatientQueueId ?? null,
          idempotencyKey: intentKeyRef.current,
          payload: {
            patient_id: effectivePatientId!,
            patient_system_id: offlinePatientQueueId ? null : patient.data?.system_id ?? null,
            receiver_facility_id: facilityId,
            ...(encounterId ? { encounter_id: encounterId } : {}),
            urgency,
            reason: reason.trim(),
            ...(summary ? { summary } : {}),
          },
        });
        setSavedOffline({
          provisionalCode: queued.provisionalCode ?? queued.queueId,
          createdAt: queued.createdAtDevice,
          reason: reason.trim(),
          urgency,
          receivingFacilityName: receivingName,
          patientName: offlinePatientQueueId
            ? offlinePatientName || localPatientRef || ""
            : patientDisplayName(patient.data, ""),
          patientSystemId: offlinePatientQueueId ? null : patient.data?.system_id ?? null,
          hasPatientDependency: Boolean(offlinePatientQueueId),
        });
      } finally {
        setSavingOffline(false);
      }
    }

    if (mustQueueOffline) {
      await enqueueStandardOffline();
      return;
    }

    try {
      const ref = await create.mutateAsync({
        idempotencyKey: intentKeyRef.current,
        body: {
          patient_id: patientId!,
          receiver_facility_id: facilityId,
          urgency,
          reason: reason.trim(),
          ...(encounterId ? { encounter_id: encounterId } : {}),
          ...(summary ? { summary } : {}),
          ...(triageSessionId ? { triage_session_id: triageSessionId } : {}),
        },
      });
      router.push(`/${locale}/referrals/${ref.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length) {
          const map: Record<string, string> = {
            patient_id: "patient",
            receiver_facility_id: "facility",
            reason: "reason",
          };
          setErrors(
            Object.fromEntries(
              Object.entries(err.fieldErrors).map(([k, v]) => [map[k] ?? k, v.join(" ")])
            )
          );
        } else {
          setFormError(t(locale, err.i18nKey));
        }
      } else {
        // Network failure mid-submission: enqueue locally with exact same idempotencyKey
        await enqueueStandardOffline();
      }
    }
  }

  if (savedOffline) {
    return (
      <div className="flex max-w-2xl flex-col gap-5" data-testid="referral-saved-offline">
        <PageHeader title={CL("savedOfflineTitle")} />
        <Alert tone="attention" title={CL("savedOfflineTitle")}>
          {CL("savedOfflineBody")}
        </Alert>
        {savedOffline.hasPatientDependency && (
          <Alert tone="info" title={CL("dependencyNotice")} />
        )}
        <ReferralSlip
          referenceCode={savedOffline.provisionalCode}
          isProvisional={true}
          patientSystemId={savedOffline.patientSystemId}
          patientName={savedOffline.patientName}
          sendingFacility={me?.active_facility?.name ?? CL("sendingFacility")}
          receivingFacility={savedOffline.receivingFacilityName}
          urgency={savedOffline.urgency}
          reason={savedOffline.reason}
          createdAt={savedOffline.createdAt}
          locale={locale}
        />
        <Link
          href={`/${locale}/referrals/outgoing`}
          className="text-dense text-indigo underline underline-offset-2"
        >
          {L("title")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
      <PageHeader
        title={L("newTitle")}
        context={
          me?.active_facility?.name
            ? `${CL("sendingFacility")}: ${me.active_facility.name}`
            : undefined
        }
      />
      {formError && <Alert tone="attention" title={L("createError")}>{formError}</Alert>}

      <section aria-label={L("patientStep")} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-heading font-semibold">{L("patientStep")}</h2>
          <Link
            href={`/${locale}/patients/new`}
            className="text-dense text-indigo underline underline-offset-2"
          >
            {CL("registerNewPatient")}
          </Link>
        </div>

        {offlinePatientQueueId && localPatientRef ? (
          <p className="m-0 flex flex-wrap items-center gap-3 text-body">
            <span>
              {CL("offlinePatientSelected")
                .replace("{name}", offlinePatientName || localPatientRef)
                .replace("{ref}", localPatientRef)}
            </span>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setOfflinePatientQueueId(null);
                setLocalPatientRef(null);
                setOfflinePatientName("");
              }}
            >
              {L("change")}
            </Button>
          </p>
        ) : patientId ? (
          <p className="m-0 flex flex-wrap items-center gap-3 text-body">
            {L("selected").replace("{name}", patientDisplayName(patient.data, "…"))}
            {patient.data?.system_id && (
              <span className="font-mono text-caption text-ink-muted">{patient.data.system_id}</span>
            )}
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setPatientId(null);
                setEncounterId("");
              }}
            >
              {L("change")}
            </Button>
          </p>
        ) : (
          <>
            <Field label={L("searchPatient")} error={errors.patient} locale={locale}>
              {(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
            </Field>
            {!q.trim() && <p className="m-0 text-dense text-ink-muted">{L("searchHelp")}</p>}
            {q.trim() && search.data?.length === 0 && (
              <p role="status" className="m-0 text-dense text-ink-muted">{L("noPatients")}</p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {(search.data ?? []).map((p) => (
                <li key={p.id}>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={() => setPatientId(p.id)}
                  >
                    {patientDisplayName(p, "")}
                    {p.name_bn ? ` (${p.name_bn})` : ""}
                    {p.system_id ? ` — ${p.system_id}` : ""}
                  </Button>
                </li>
              ))}
            </ul>

            {offlinePatients.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 rounded-control border border-ochre bg-ochre-wash p-3">
                <span className="text-caption font-semibold text-ochre">
                  {CL("offlinePatientsHeading")}
                </span>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {offlinePatients.map((op) => (
                    <li key={op.queueId}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setOfflinePatientQueueId(op.queueId);
                          setLocalPatientRef(op.tempEntityRef ?? op.queueId);
                          setOfflinePatientName(op.payload?.given_name ?? "");
                        }}
                      >
                        {op.payload?.given_name} ({op.tempEntityRef})
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {patientId && !offlinePatientQueueId && (
          <Field label={L("encounter")} locale={locale}>
            {(p) => (
              <select
                {...p}
                className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
                value={encounterId}
                onChange={(e) => setEncounterId(e.target.value)}
              >
                <option value="">{L("noEncounter")}</option>
                {encounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>
                    {formatDhakaDateTime(enc.period_start, locale)}, {enc.reason || enc.encounter_type}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {patientId && !offlinePatientQueueId && reportHistory && reportHistory.reports_count > 0 && (
          <PatientReportHistoryCard history={reportHistory} locale={locale} />
        )}
        {patientId && !offlinePatientQueueId && (
          <Field label={t(locale, "patients.upload")} help={t(locale, "patients.uploadHelp")} error={uploadError ?? undefined} locale={locale}>
            {(f) => (
              <input
                {...f}
                type="file"
                accept="application/pdf,image/*"
                disabled={uploadDoc.isPending}
                onChange={(e) => void onAttachReport(e.target.files?.[0])}
                className="text-dense"
              />
            )}
          </Field>
        )}
      </section>

      <section aria-label={L("destinationStep")} className="flex flex-col gap-3">
        <h2 className="m-0 text-heading font-semibold">{L("destinationStep")}</h2>
        <Field label={L("destination")} required error={errors.facility} locale={locale}>
          {(p) => (
            <select
              {...p}
              className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
            >
              <option value="">{L("chooseFacility")}</option>
              {(facilities.data ?? []).map((f) => {
                const c = f.latest_capacity;
                return (
                  <option key={f.id} value={f.id}>
                    {pickName(locale, f.name, f.name_bn)}
                    {c
                      ? `, ${t(locale, "doctors.reported")
                          .replace("{ago}", formatTimeAgo(c.reported_at, locale))
                          .replace("{source}", c.source)}`
                      : ""}
                  </option>
                );
              })}
            </select>
          )}
        </Field>
      </section>

      <section aria-label={L("urgencyStep")} className="flex flex-col gap-3">
        <h2 className="m-0 text-heading font-semibold">{L("urgencyStep")}</h2>
        <SegmentedControl
          label={L("urgency")}
          value={urgency}
          onValueChange={setUrgency}
          options={[
            { value: "routine", label: L("routine") },
            { value: "urgent", label: L("urgent") },
            { value: "emergency", label: L("emergency") },
          ]}
        />
        {urgency === "emergency" && (
          <Link href={`/${locale}/emergency`} className="text-dense text-indigo underline underline-offset-2">
            {L("useEmergency")}
          </Link>
        )}
        <Field label={L("reason")} required error={errors.reason} locale={locale}>
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </section>

      <section aria-label={CL("clinicalContext")} className="flex flex-col gap-3 rounded-panel border border-line bg-sunken p-4">
        <h2 className="m-0 text-dense font-semibold text-ink">{CL("clinicalContext")}</h2>
        <Field label={CL("symptoms")} locale={locale}>
          {(p) => <Textarea {...p} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />}
        </Field>
        <Field label={CL("observations")} locale={locale}>
          {(p) => <Input {...p} value={observations} onChange={(e) => setObservations(e.target.value)} />}
        </Field>
        <Field label={CL("allergyStatus")} locale={locale}>
          {(p) => (
            <select
              {...p}
              className="h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
              value={allergyStatus}
              onChange={(e) => setAllergyStatus(e.target.value as AllergyStatus)}
            >
              <option value="unknown">{CL("allergyUnknown")}</option>
              <option value="none_known">{CL("allergyNone")}</option>
              <option value="known">{CL("allergyKnown")}</option>
            </select>
          )}
        </Field>
        {allergyStatus === "known" && (
          <Field label={CL("allergyDetails")} locale={locale}>
            {(p) => <Input {...p} value={allergyDetails} onChange={(e) => setAllergyDetails(e.target.value)} />}
          </Field>
        )}
      </section>

      <div className="flex gap-3">
        <Button type="submit" size="lg" loading={create.isPending || savingOffline} loadingLabel={L("creating")}>
          {L("create")}
        </Button>
        <Link href={`/${locale}/referrals`} className="flex items-center text-dense text-indigo underline underline-offset-2">
          {L("cancel")}
        </Link>
      </div>
    </form>
  );
}
