"use client";

import React, { useRef, useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { ApiError, createIntentIdempotencyKey } from "../../api/client";
import { useApi } from "../../api/queries/provider";
import type { Referral } from "../../api/queries/types";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/field";
import { SegmentedControl } from "../ui/selection";
import { Alert } from "../ui/states";
import { Panel } from "../ui/surfaces";

export interface PartialReferralIntakePanelProps {
  initialCode?: string;
  locale: Locale;
  onAccepted: (referral: Referral) => void;
  onCancel: () => void;
}

type Urgency = "routine" | "urgent" | "emergency";
type SexValue = "unknown" | "female" | "male" | "other";

/**
 * Receiving-facility partial referral intake panel (Phase 3B contract: POST /api/v1/referrals/partial-intake).
 * Allows immediate patient acceptance using a provisional offline slip or MW-REF: QR token
 * without fabricating missing clinical data.
 */
export function PartialReferralIntakePanel({
  initialCode = "",
  locale,
  onAccepted,
  onCancel,
}: PartialReferralIntakePanelProps) {
  const api = useApi();
  const L = (k: string) => t(locale, `receiving.${k}`);

  const [provisionalCode, setProvisionalCode] = useState(
    initialCode.trim().replace(/^MW-REF:/i, "")
  );
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("urgent");
  const [patientSystemId, setPatientSystemId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [estimatedAge, setEstimatedAge] = useState("");
  const [sex, setSex] = useState<SexValue>("unknown");
  const [symptoms, setSymptoms] = useState("");
  const [treatmentGiven, setTreatmentGiven] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const intentKeyRef = useRef<string>(createIntentIdempotencyKey());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanedCode = provisionalCode.trim().replace(/^MW-REF:/i, "");
    if (!cleanedCode || !reason.trim()) {
      setError(t(locale, "common.fieldRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Referral>("/referrals/partial-intake", {
        idempotencyKey: intentKeyRef.current,
        body: {
          provisional_code: cleanedCode,
          reason: reason.trim(),
          urgency,
          ...(patientSystemId.trim() ? { patient_system_id: patientSystemId.trim() } : {}),
          ...(patientName.trim() ? { patient_name: patientName.trim() } : {}),
          ...(estimatedAge.trim() ? { estimated_age: Number(estimatedAge.trim()) } : {}),
          sex,
          ...(symptoms.trim() ? { presenting_symptoms: symptoms.trim() } : {}),
          ...(treatmentGiven.trim() ? { treatment_given: treatmentGiven.trim() } : {}),
          idempotency_key: intentKeyRef.current,
        },
      });
      onAccepted(res.data);
    } catch (err) {
      setError(t(locale, err instanceof ApiError ? err.i18nKey : "error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
        data-testid="partial-referral-intake-panel"
      >
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-heading font-semibold text-ink">{L("partialTitle")}</h2>
          <p className="m-0 text-dense text-ink-muted">{L("partialHelp")}</p>
        </div>

        {error && <Alert tone="attention" title={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("provisionalCode")} required locale={locale}>
            {(p) => (
              <Input
                {...p}
                value={provisionalCode}
                onChange={(e) => setProvisionalCode(e.target.value)}
              />
            )}
          </Field>
          <Field label={L("patientSystemId")} locale={locale}>
            {(p) => (
              <Input
                {...p}
                value={patientSystemId}
                onChange={(e) => setPatientSystemId(e.target.value)}
              />
            )}
          </Field>
        </div>

        <SegmentedControl
          label={L("urgency")}
          value={urgency}
          onValueChange={(v) => setUrgency(v as Urgency)}
          options={[
            { value: "routine", label: t(locale, "referrals.routine") },
            { value: "urgent", label: t(locale, "referrals.urgent") },
            { value: "emergency", label: t(locale, "referrals.emergency") },
          ]}
        />

        <Field label={L("reason")} required locale={locale}>
          {(p) => (
            <Textarea
              {...p}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={L("patientName")} locale={locale}>
            {(p) => (
              <Input
                {...p}
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
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
          <Field label={L("sex")} locale={locale}>
            {(p) => (
              <select
                {...p}
                className="h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
                value={sex}
                onChange={(e) => setSex(e.target.value as SexValue)}
              >
                <option value="unknown">{t(locale, "chw.register.sexUnknown")}</option>
                <option value="female">{t(locale, "chw.register.sexFemale")}</option>
                <option value="male">{t(locale, "chw.register.sexMale")}</option>
                <option value="other">{t(locale, "chw.register.sexOther")}</option>
              </select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L("symptoms")} locale={locale}>
            {(p) => (
              <Textarea
                {...p}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            )}
          </Field>
          <Field label={L("treatmentGiven")} locale={locale}>
            {(p) => (
              <Textarea
                {...p}
                value={treatmentGiven}
                onChange={(e) => setTreatmentGiven(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} loadingLabel={L("submitting")}>
            {L("submit")}
          </Button>
          <Button type="button" variant="quiet" onClick={onCancel}>
            {L("closePartial")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
