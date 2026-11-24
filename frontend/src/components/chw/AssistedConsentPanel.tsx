"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { ApiError, createIntentIdempotencyKey } from "../../api/client";
import { useApi } from "../../api/queries/provider";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/field";
import { SegmentedControl } from "../ui/selection";
import { Alert } from "../ui/states";
import { Panel } from "../ui/surfaces";

export interface AssistedConsentPanelProps {
  consentRequestId: string;
  patientHasAccount?: boolean;
  locale: Locale;
  onRecorded: () => Promise<unknown> | void;
}

type AssistedMethod = "assisted_verbal" | "assisted_paper";

/**
 * Phase 3D Part 3: CHW Assisted In-Person Consent Panel.
 * - Calls POST /api/v1/consents/requests/{id}/record-assisted.
 * - Supports assisted_verbal and assisted_paper.
 * - Blocked if patient has an active PatientAccount.
 * - Explicitly notes clinical/legal review requirement and that assisted consent does NOT replace clinician approval.
 */
export function AssistedConsentPanel({
  consentRequestId,
  patientHasAccount = false,
  locale,
  onRecorded,
}: AssistedConsentPanelProps) {
  const api = useApi();
  const L = (k: string) => t(locale, `chw.consent.${k}`);

  const [method, setMethod] = useState<AssistedMethod>("assisted_verbal");
  const [confirmedInPerson, setConfirmedInPerson] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [notes, setNotes] = useState("");
  const [consentLang, setConsentLang] = useState<"bn" | "en">(locale);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  if (patientHasAccount) {
    return (
      <Alert tone="info" title={L("title")}>
        {L("hasAccountBlocked")}
      </Alert>
    );
  }

  if (success) {
    return (
      <Alert tone="info" title={L("title")}>
        {L("recorded")}
      </Alert>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmedInPerson) {
      setError(L("confirmRequired"));
      return;
    }
    if (!witnessName.trim()) {
      setError(L("witnessRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post(`/consents/requests/${encodeURIComponent(consentRequestId)}/record-assisted`, {
        idempotencyKey: createIntentIdempotencyKey(),
        body: {
          method,
          patient_confirmed_in_person: true,
          witness_name: witnessName.trim(),
          notes: notes.trim(),
          consent_language: consentLang,
        },
      });
      setSuccess(true);
      await onRecorded();
    } catch (err) {
      setError(t(locale, err instanceof ApiError ? err.i18nKey : "error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" data-testid="assisted-consent-panel">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-heading font-semibold text-ink">{L("title")}</h2>
          <p className="m-0 text-caption font-semibold text-ochre">{L("reviewNotice")}</p>
          <p className="m-0 text-dense text-ink">{L("explanation")}</p>
          <p className="m-0 text-caption text-ink-muted">{L("approvalNotice")}</p>
        </div>

        {error && <Alert tone="attention" title={error} />}

        <SegmentedControl
          label={L("methodLabel")}
          value={method}
          onValueChange={(v) => setMethod(v as AssistedMethod)}
          options={[
            { value: "assisted_verbal", label: L("methodVerbal") },
            { value: "assisted_paper", label: L("methodPaper") },
          ]}
        />

        <Field label={L("languageLabel")} locale={locale}>
          {(p) => (
            <select
              {...p}
              className="h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-body"
              value={consentLang}
              onChange={(e) => setConsentLang(e.target.value as "bn" | "en")}
            >
              <option value="bn">বাংলা (bn)</option>
              <option value="en">English (en)</option>
            </select>
          )}
        </Field>

        <Field label={L("witnessName")} required locale={locale}>
          {(p) => (
            <Input
              {...p}
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
            />
          )}
        </Field>

        <Field label={L("notes")} locale={locale}>
          {(p) => (
            <Textarea
              {...p}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>

        <label className="flex cursor-pointer items-start gap-2 text-dense text-ink">
          <input
            type="checkbox"
            checked={confirmedInPerson}
            onChange={(e) => setConfirmedInPerson(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>{L("confirmedInPerson")}</span>
        </label>

        <div>
          <Button type="submit" loading={busy} loadingLabel={L("submitting")}>
            {L("submit")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
