"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError, createIntentIdempotencyKey } from "../../../../../../api/client";
import {
  useConfirmTriageSummary,
  useEmergencyFacilities,
  useFinishTriageSession,
  useTriageSession,
  useTriageSessionControl,
} from "../../../../../../api/queries/hooks";
import type { TriageSessionDetail } from "../../../../../../api/queries/types";
import { t } from "../../../../../../i18n/format";
import { type LocalePageProps } from "../../../../../resolveLocale";
import { usePageLocale } from "../../../../../usePageLocale";
import { EmergencyScreen } from "../../../../../../components/EmergencyScreen/EmergencyScreen";
import { Column, QueryBoundary } from "../../../../../../components/QueryBoundary";
import { PageHeader, Panel } from "../../../../../../components/ui/surfaces";
import { Alert } from "../../../../../../components/ui/states";
import { Button, buttonVariants } from "../../../../../../components/ui/button";

interface EditableFields {
  chief_complaint: string;
  duration: string;
  severity: string;
  additional_notes: string;
  suggested_specialty: string;
}

function extractInitialFields(session: TriageSessionDetail, locale: "bn" | "en"): EditableFields {
  const sf = session.summary?.structured_fields ?? {};
  const edits = session.summary?.patient_edits ?? {};
  const defaultSpec =
    locale === "bn"
      ? sf.suggested_specialty_bn || sf.suggested_specialty_en || ""
      : sf.suggested_specialty_en || sf.suggested_specialty_bn || "";

  return {
    chief_complaint: String(edits.chief_complaint ?? sf.chief_complaint ?? ""),
    duration: String(edits.duration ?? sf.duration ?? ""),
    severity: String(edits.severity ?? sf.severity ?? ""),
    additional_notes: String(edits.additional_notes ?? sf.additional_notes ?? ""),
    suggested_specialty: String(edits.suggested_specialty ?? defaultSpec),
  };
}

function SummaryEditor({ session, locale }: { session: TriageSessionDetail; locale: "bn" | "en" }) {
  const router = useRouter();
  const finish = useFinishTriageSession();
  const confirm = useConfirmTriageSummary();
  const control = useTriageSessionControl();
  const T = (k: string) => t(locale, `triage.${k}`);

  const [initial, setInitial] = useState<EditableFields>(() => extractInitialFields(session, locale));
  const [fields, setFields] = useState<EditableFields>(() => extractInitialFields(session, locale));
  const [confirmed, setConfirmed] = useState(session.state === "CONFIRMED_BY_PATIENT");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [showEmergencyFacilities, setShowEmergencyFacilities] = useState(false);
  const emergencyFacilities = useEmergencyFacilities(showEmergencyFacilities);

  useEffect(() => {
    const next = extractInitialFields(session, locale);
    setInitial(next);
    setFields(next);
    if (session.state === "CONFIRMED_BY_PATIENT") setConfirmed(true);
  }, [session.id, locale]);

  if (session.state === "EMERGENCY_PATHWAY") {
    const emTurn = [...(session.turns ?? [])].reverse().find((turn) => turn.response_policy === "emergency");
    return (
      <EmergencyScreen
        instructionText={
          emTurn?.text ??
          "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency hospital immediately."
        }
        locale={locale}
        onShowNearestFacilities={() => setShowEmergencyFacilities(true)}
        facilitiesRequested={showEmergencyFacilities}
        facilitiesLoading={emergencyFacilities.isLoading}
        facilitiesError={emergencyFacilities.isError}
        facilities={emergencyFacilities.data ?? []}
      />
    );
  }

  const sf = session.summary?.structured_fields ?? {};
  const specialtyCode = typeof sf.suggested_specialty_code === "string" ? sf.suggested_specialty_code : "";
  const sources = Array.isArray(sf.guidance_sources) ? sf.guidance_sources : [];
  const guidanceText =
    typeof session.summary?.guidance_given === "string"
      ? session.summary.guidance_given
      : Array.isArray(session.summary?.guidance_given)
        ? session.summary.guidance_given.map(String).join(" ")
        : "";

  const isChanged = (key: keyof EditableFields) => fields[key].trim() !== initial[key].trim();

  async function handleConfirm() {
    setErrorMessage(null);
    try {
      let currentVersion = session.version;
      let currentState = session.state;
      if (currentState === "PAUSED") {
        const resumed = await control.mutateAsync({
          sessionId: session.id,
          action: "resume",
          version: currentVersion,
          idempotencyKey: createIntentIdempotencyKey(),
        });
        currentVersion = resumed.version;
        currentState = resumed.state;
      }
      if (currentState === "ACTIVE") {
        const finished = await finish.mutateAsync({
          sessionId: session.id,
          version: currentVersion,
          idempotencyKey: createIntentIdempotencyKey(),
        });
        currentVersion = finished.version;
      }

      const edits: Record<string, string> = {};
      (Object.keys(fields) as Array<keyof EditableFields>).forEach((k) => {
        if (isChanged(k)) {
          edits[k] = fields[k];
        }
      });

      await confirm.mutateAsync({
        sessionId: session.id,
        edits,
        version: currentVersion,
        idempotencyKey: createIntentIdempotencyKey(),
      });
      setConfirmed(true);
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.message : T("confirmError"));
    }
  }

  async function handleStartAgain() {
    setRestarting(true);
    setErrorMessage(null);
    const openStates = ["CREATED", "ACTIVE", "PAUSED", "SUMMARY_PENDING_REVIEW"];
    if (openStates.includes(session.state)) {
      try {
        await control.mutateAsync({
          sessionId: session.id,
          action: "end",
          version: session.version,
          idempotencyKey: createIntentIdempotencyKey(),
        });
      } catch {
        // Proceed to fresh triage even if session already ended
      }
    }
    setRestarting(false);
    router.push(`/${locale}/triage`);
  }

  const doctorsParams = new URLSearchParams();
  if (specialtyCode) doctorsParams.set("specialty", specialtyCode);
  doctorsParams.set("triage_session_id", session.id);
  const doctorsHref = `/${locale}/doctors?${doctorsParams.toString()}`;

  const fieldDefs: Array<{ key: keyof EditableFields; label: string }> = [
    { key: "chief_complaint", label: T("chiefComplaint") },
    { key: "duration", label: T("duration") },
    { key: "severity", label: T("severity") },
    { key: "additional_notes", label: T("additionalNotes") },
    { key: "suggested_specialty", label: T("suggestedSpecialty") },
  ];

  const submitting = finish.isPending || confirm.isPending;

  return (
    <>
      <PageHeader serif title={T("summaryTitle")} context={T("summaryContext")} />

      {session.summary?.patient_words && (
        <Panel title={T("inYourWords")}>
          <blockquote className="m-0 border-l-2 border-indigo pl-4 text-body italic text-ink">
            “{session.summary.patient_words}”
          </blockquote>
        </Panel>
      )}

      <Panel title={T("extractedFields")}>
        <div className="flex flex-col gap-4">
          {fieldDefs.map(({ key, label }) => {
            const inputId = `triage-field-${key}`;
            return (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-dense font-medium text-ink">
                    {label}
                  </label>
                  {isChanged(key) && (
                    <span className="rounded-pill bg-indigo-wash px-2 py-0.5 text-caption font-semibold text-indigo">
                      {t(locale, "patient.changedByYou")}
                    </span>
                  )}
                </div>
                <input
                  id={inputId}
                  type="text"
                  disabled={confirmed}
                  value={fields[key]}
                  onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body disabled:bg-sunken"
                />
              </div>
            );
          })}
        </div>
      </Panel>

      {(guidanceText || sources.length > 0) && (
        <Panel title={T("guidanceTitle")}>
          <div className="flex flex-col gap-3">
            {guidanceText && <p className="m-0 text-body text-ink">{guidanceText}</p>}
            {sources.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <span className="text-caption font-semibold text-ink-muted">{T("sourcesTitle")}</span>
                <ul className="m-0 list-disc ps-5 text-dense text-ink-muted">
                  {sources.map((src, idx) => (
                    <li key={idx}>
                      {src.title}
                      {src.publisher ? ` — ${src.publisher}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      )}

      {errorMessage && <Alert tone="attention" title={errorMessage} />}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        {!confirmed ? (
          <>
            <Button
              size="lg"
              loading={submitting}
              loadingLabel={T("confirming")}
              onClick={() => void handleConfirm()}
            >
              {T("confirmAndFindDoctor")}
            </Button>
            <Button
              variant="quiet"
              disabled={restarting}
              onClick={() => void handleStartAgain()}
            >
              {T("startAgain")}
            </Button>
          </>
        ) : (
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="m-0 text-dense font-semibold text-positive">
              {`✓ ${T("confirmedNotice")}`}
            </p>
            <Link href={doctorsHref} className={buttonVariants({ variant: "primary", size: "lg" })}>
              {`${T("browseDoctors")} →`}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function TriageSummaryReviewPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const routeParams = useParams<{ id?: string }>();
  const sessionId = typeof routeParams?.id === "string" ? routeParams.id : "";
  const query = useTriageSession(sessionId);
  const T = (k: string) => t(locale, `triage.${k}`);

  return (
    <Column>
      <QueryBoundary
        query={query}
        locale={locale}
        loadingLabel={T("loadingSession")}
        errorMessage={T("confirmError")}
        notFoundMessage={T("sessionNotFound")}
      >
        {(session) => <SummaryEditor session={session} locale={locale} />}
      </QueryBoundary>
    </Column>
  );
}
