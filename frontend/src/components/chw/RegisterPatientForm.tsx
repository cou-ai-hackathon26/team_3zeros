"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePageLocale } from "../../app/usePageLocale";
import { ApiError, createIntentIdempotencyKey } from "../../api/client";
import { useApi } from "../../api/queries/provider";
import type { Patient } from "../../api/queries/types";
import { useMe } from "../../auth/me";
import { t } from "../../i18n/format";
import { unifiedOfflineStore } from "../../offline/store";
import type { OfflinePatientPayload, UnifiedOfflineQueueStore } from "../../offline/unifiedQueue";
import { Button, buttonVariants } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Alert } from "../ui/states";
import { PageHeader, Panel } from "../ui/surfaces";

export interface RegisterPatientFormProps {
  /** Optional store override for isolated tests. */
  store?: UnifiedOfflineQueueStore;
}

type SexValue = "female" | "male" | "other" | "unknown";
type IdType = "" | "nid" | "birth_registration";

interface RegisteredOnlineResult {
  mode: "online";
  patient: Patient;
}

interface RegisteredOfflineResult {
  mode: "offline";
  queueId: string;
  tempEntityRef: string;
  givenName: string;
}

/**
 * Phase 3D Part 2: CHW Phone-less Patient Registration Form.
 * - Matches PatientCreateSerializer (given_name, sex required; phone, email, NID, birth_reg optional).
 * - Uses single-intent Idempotency-Key to prevent duplicate submissions.
 * - Supports offline registration via unifiedOfflineStore.enqueueOfflinePatient (never fabricates MWP-* IDs).
 */
export function RegisterPatientForm({ store = unifiedOfflineStore }: RegisterPatientFormProps) {
  const locale = usePageLocale(undefined, "en");
  const api = useApi();
  const { me } = useMe();
  const L = (k: string) => t(locale, `chw.register.${k}`);

  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [sex, setSex] = useState<SexValue>("female");
  const [estimatedAge, setEstimatedAge] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState<IdType>("");
  const [idValue, setIdValue] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisteredOnlineResult | RegisteredOfflineResult | null>(null);

  // Single-intent idempotency key preserved across retries for this form submission
  const intentKeyRef = useRef<string>(createIntentIdempotencyKey());
  const submittingRef = useRef<boolean>(false);

  function resetForm() {
    setGivenName("");
    setFamilyName("");
    setNameBn("");
    setSex("female");
    setEstimatedAge("");
    setBirthDate("");
    setPhone("");
    setIdType("");
    setIdValue("");
    setErrors({});
    setFormError(null);
    setResult(null);
    intentKeyRef.current = createIntentIdempotencyKey();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;

    const requiredMsg = t(locale, "common.fieldRequired");
    const nextErrors: Record<string, string> = {};
    if (!givenName.trim()) nextErrors.given_name = requiredMsg;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const identifiers =
      idType && idValue.trim()
        ? [{ system: idType, value: idValue.trim(), verified: false }]
        : [];

    const payload: OfflinePatientPayload = {
      given_name: givenName.trim(),
      ...(familyName.trim() ? { family_name: familyName.trim() } : {}),
      ...(nameBn.trim() ? { name_bn: nameBn.trim() } : {}),
      sex,
      ...(estimatedAge.trim() ? { estimated_age: Number(estimatedAge.trim()) } : {}),
      ...(birthDate.trim() ? { birth_date: birthDate.trim() } : {}),
      phone: phone.trim() ? phone.trim() : null,
      ...(identifiers.length > 0 ? { identifiers } : {}),
    };

    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);

    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

    async function enqueueOffline() {
      const ownerUserId = me?.id ?? "anonymous-local";
      const facilityId = me?.active_facility?.id ?? "unknown-facility";
      const queued = await store.enqueueOfflinePatient({
        ownerUserId,
        facilityId,
        payload,
        idempotencyKey: intentKeyRef.current,
      });
      setResult({
        mode: "offline",
        queueId: queued.queueId,
        tempEntityRef: queued.tempEntityRef ?? queued.queueId,
        givenName: payload.given_name,
      });
    }

    try {
      if (isOffline) {
        await enqueueOffline();
        return;
      }

      const res = await api.post<Patient>("/patients/", {
        idempotencyKey: intentKeyRef.current,
        body: payload,
      });
      setResult({ mode: "online", patient: res.data });
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) {
          setErrors(
            Object.fromEntries(
              Object.entries(err.fieldErrors).map(([k, v]) => [k, v.join(" ")])
            )
          );
        } else {
          setFormError(t(locale, err.i18nKey));
        }
      } else {
        // Network failure mid-request: preserve encrypted in offline queue with exact same idempotencyKey
        try {
          await enqueueOffline();
        } catch {
          setFormError(t(locale, "error.generic"));
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (result?.mode === "online") {
    const pat = result.patient;
    return (
      <div className="flex max-w-xl flex-col gap-5" data-testid="patient-registered-online">
        <PageHeader title={L("successTitle")} />
        <Panel>
          <div className="flex flex-col gap-3">
            <div className="text-heading font-semibold text-ink">
              {pat.given_name} {pat.family_name ?? ""}
            </div>
            {pat.system_id && (
              <div className="flex flex-col gap-0.5">
                <span className="text-caption font-semibold uppercase text-ink-muted">
                  {L("systemIdLabel")}
                </span>
                <span
                  data-testid="patient-system-id"
                  className="font-mono text-2xl font-bold tracking-wider text-positive"
                >
                  {pat.system_id}
                </span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/referrals/new?patient=${encodeURIComponent(pat.id)}`}
                className={buttonVariants({ size: "lg" })}
              >
                {L("startReferral")}
              </Link>
              <Button type="button" variant="secondary" onClick={resetForm}>
                {L("registerAnother")}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (result?.mode === "offline") {
    return (
      <div className="flex max-w-xl flex-col gap-5" data-testid="patient-registered-offline">
        <PageHeader title={L("offlineSuccessTitle")} />
        <Alert tone="attention" title={L("offlineSuccessTitle")}>
          {L("offlineNotice")}
        </Alert>
        <Panel>
          <div className="flex flex-col gap-3">
            <div className="text-heading font-semibold text-ink">{result.givenName}</div>
            <div className="flex flex-col gap-0.5">
              <span className="text-caption font-semibold uppercase text-ink-muted">
                {L("tempRefLabel")}
              </span>
              <span
                data-testid="patient-temp-ref"
                className="font-mono text-body font-bold text-ochre"
              >
                {result.tempEntityRef}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/referrals/new?offlinePatientQueueId=${encodeURIComponent(result.queueId)}&localPatientRef=${encodeURIComponent(result.tempEntityRef)}`}
                className={buttonVariants({ size: "lg" })}
              >
                {L("startOfflineReferral")}
              </Link>
              <Button type="button" variant="secondary" onClick={resetForm}>
                {L("registerAnother")}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-xl flex-col gap-5">
      <PageHeader title={L("title")} context={L("subtitle")} />
      {formError && <Alert tone="attention" title={formError} />}

      <Field label={L("givenName")} required error={errors.given_name} locale={locale}>
        {(p) => (
          <Input
            {...p}
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            autoComplete="given-name"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L("familyName")} locale={locale}>
          {(p) => (
            <Input
              {...p}
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              autoComplete="family-name"
            />
          )}
        </Field>
        <Field label={L("nameBn")} locale={locale}>
          {(p) => (
            <Input
              {...p}
              value={nameBn}
              onChange={(e) => setNameBn(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={L("sex")} required locale={locale}>
          {(p) => (
            <select
              {...p}
              className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
              value={sex}
              onChange={(e) => setSex(e.target.value as SexValue)}
            >
              <option value="female">{L("sexFemale")}</option>
              <option value="male">{L("sexMale")}</option>
              <option value="other">{L("sexOther")}</option>
              <option value="unknown">{L("sexUnknown")}</option>
            </select>
          )}
        </Field>
        <Field label={L("estimatedAge")} locale={locale}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={150}
              value={estimatedAge}
              onChange={(e) => setEstimatedAge(e.target.value)}
            />
          )}
        </Field>
        <Field label={L("birthDate")} locale={locale}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field label={L("phone")} help={L("phoneHelp")} locale={locale}>
        {(p) => (
          <Input
            {...p}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L("identifierType")} locale={locale}>
          {(p) => (
            <select
              {...p}
              className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
              value={idType}
              onChange={(e) => setIdType(e.target.value as IdType)}
            >
              <option value="">{L("identifierNone")}</option>
              <option value="nid">{L("identifierNid")}</option>
              <option value="birth_registration">{L("identifierBirthReg")}</option>
            </select>
          )}
        </Field>
        {idType && (
          <Field label={L("identifierValue")} locale={locale}>
            {(p) => (
              <Input
                {...p}
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={submitting} loadingLabel={L("submitting")}>
          {L("submit")}
        </Button>
        <Link
          href={`/${locale}/patients`}
          className="text-dense text-indigo underline underline-offset-2"
        >
          {L("backToPatients")}
        </Link>
      </div>
    </form>
  );
}
