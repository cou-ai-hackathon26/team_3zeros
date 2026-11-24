"use client";

import React, { Suspense, lazy, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEmergencyFacilities } from "../../api/queries/hooks";
import { useMe } from "../../auth/me";
import { useTriageSessionController } from "../../voice/controller";

// The call screen (and its animation code) loads only when a real call starts, keeping the patient first load small.
const CallScreen = lazy(() => import("../../voice/callSetup").then((m) => ({ default: m.CallScreen })));
const InterviewProgress = lazy(() => import("../../components/VoiceCall/InterviewProgress").then((m) => ({ default: m.InterviewProgress })));
import { VoicePanel } from "../../components/VoicePanel/VoicePanel";
import { EmergencyScreen } from "../../components/EmergencyScreen/EmergencyScreen";
import { t } from "../../i18n/format";
import { type LocalePageProps } from "../../app/resolveLocale";
import { usePageLocale } from "../../app/usePageLocale";
import { PageHeader } from "../../components/ui/surfaces";
import { Button, buttonVariants } from "../../components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/states";

export interface TriageViewProps {
  params?: LocalePageProps["params"];
  resumeSessionId?: string;
}

/**
 * UIUX §6.2 & §6.3, FRONTEND §8:
 * Focus-mode triage workspace with:
 * - Explicit disclosure consent gate for both voice and text entry (MASTERPLAN §6.3).
 * - Clean Vapi-ready voice placeholder paired with full server-backed text triage.
 * - Immediate zero-motion EmergencyScreen interrupt with nearest emergency facilities lookup.
 */
export function TriageView({ params, resumeSessionId }: TriageViewProps) {
  const initialLocale = usePageLocale(params, "bn");
  const router = useRouter();
  const { me } = useMe();
  const ctrl = useTriageSessionController(initialLocale, resumeSessionId);
  const [finishing, setFinishing] = useState(false);
  const [showEmergencyFacilities, setShowEmergencyFacilities] = useState(false);

  const emergencyFacilities = useEmergencyFacilities(showEmergencyFacilities);

  // The interview finished by itself (closing line, or the call ended after it): open the summary.
  useEffect(() => {
    if (ctrl.sessionState === "SUMMARY_PENDING_REVIEW" && ctrl.sessionId) {
      router.push(`/${ctrl.language}/triage/summary/${ctrl.sessionId}`);
    }
  }, [ctrl.sessionState, ctrl.sessionId, ctrl.language, router]);

  let modeParam: string | null = null;
  try {
    const searchParams = useSearchParams();
    modeParam = searchParams?.get("mode") ?? null;
  } catch {
    modeParam = null;
  }

  const T = (k: string) => t(ctrl.language, `triage.${k}`);

  if (ctrl.loadingResume) {
    return (
      <div className="py-6">
        <Skeleton label={T("loadingSession")} className="h-48" />
      </div>
    );
  }

  if (ctrl.notFound) {
    return (
      <EmptyState
        message={T("sessionNotFound")}
        action={
          <Link href={`/${ctrl.language}/triage`} className={buttonVariants({ size: "lg" })}>
            {T("startNew")}
          </Link>
        }
      />
    );
  }

  if (ctrl.phase === "emergency" || ctrl.emergencyInstruction) {
    return (
      <EmergencyScreen
        instructionText={
          ctrl.emergencyInstruction ??
          "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency hospital immediately."
        }
        locale={ctrl.language}
        onShowNearestFacilities={() => setShowEmergencyFacilities(true)}
        facilitiesRequested={showEmergencyFacilities}
        facilitiesLoading={emergencyFacilities.isLoading}
        facilitiesError={emergencyFacilities.isError}
        facilities={emergencyFacilities.data ?? []}
      />
    );
  }

  if (ctrl.errorMessage && resumeSessionId && ctrl.turns.length === 0) {
    return <ErrorState message={ctrl.errorMessage} locale={ctrl.language} />;
  }

  if (
    ctrl.sessionId &&
    (ctrl.sessionState === "SUMMARY_PENDING_REVIEW" || ctrl.sessionState === "CONFIRMED_BY_PATIENT")
  ) {
    return (
      <EmptyState
        message={T("summaryContext")}
        action={
          <Link
            href={`/${ctrl.language}/triage/summary/${ctrl.sessionId}`}
            className={buttonVariants({ size: "lg" })}
          >
            {T("summaryTitle")}
          </Link>
        }
      />
    );
  }

  if (ctrl.sessionState === "ENDED_BY_PATIENT" || ctrl.sessionState === "ABANDONED") {
    return (
      <EmptyState
        message={T("sessionNotFound")}
        action={
          <Link href={`/${ctrl.language}/triage`} className={buttonVariants({ size: "lg" })}>
            {T("startNew")}
          </Link>
        }
      />
    );
  }

  async function handleFinishAndReview() {
    if (finishing) return;
    setFinishing(true);
    const id = await ctrl.finish();
    setFinishing(false);
    if (id) {
      router.push(`/${ctrl.language}/triage/summary/${id}`);
    }
  }

  async function handleEndSession() {
    // Hanging up after at least one answer keeps the summary instead of discarding it (D-27).
    if (ctrl.patientTurnCount > 0 && ctrl.sessionId) {
      await handleFinishAndReview();
      return;
    }
    await ctrl.end();
    router.push(me ? `/${ctrl.language}/home` : `/${ctrl.language}`);
  }

  const showSideRail = !ctrl.callActive && Boolean(ctrl.sessionId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader serif title={T("pageTitle")} context={T("pageContext")} />

      {ctrl.callActive ? (
        <Suspense fallback={null}>
          <CallScreen
            phase={ctrl.phase}
            language={ctrl.language}
            turns={ctrl.turns}
            level={ctrl.micLevel}
            seconds={ctrl.callSeconds}
            onMute={ctrl.setMuted}
            onEnd={() => void handleEndSession()}
            onSwitchToText={ctrl.switchToText}
            onFinish={() => void handleFinishAndReview()}
            answered={ctrl.patientTurnCount}
            target={ctrl.interview.target}
            max={ctrl.interview.max}
          />
        </Suspense>
      ) : (
        <div className={showSideRail ? "grid gap-6 lg:grid-cols-[1fr_290px] lg:items-start" : ""}>
          {ctrl.sessionId && ctrl.sessionState === "ACTIVE" && (
            <Suspense fallback={null}>
              <InterviewProgress answered={ctrl.patientTurnCount} target={ctrl.interview.target} max={ctrl.interview.max} language={ctrl.language} />
            </Suspense>
          )}
          <VoicePanel
            phase={ctrl.phase}
            language={ctrl.language}
            turns={ctrl.turns}
            micLevel={ctrl.micLevel}
            textMode={ctrl.textMode}
            preferredMode={modeParam === "text" ? "text" : "voice"}
            voicePlaceholderActive={ctrl.voicePlaceholderActive}
            errorMessage={ctrl.errorMessage}
            callSeconds={ctrl.callSeconds}
            providerConfig={ctrl.providerConfig}
            audioDevices={ctrl.audioDevices}
            onUpdateProvider={ctrl.updateProvider}
            onLanguageChange={ctrl.setLanguage}
            onAllowMicrophone={() => void ctrl.allowMicrophone()}
            onSwitchToText={() => void ctrl.startTextSession()}
            onPause={() => void ctrl.pause()}
            onResume={() => void ctrl.resume()}
            onEnd={() => void handleEndSession()}
            onSendTextTurn={(txt) => void ctrl.sendTextTurn(txt)}
          />

          {showSideRail && (
            <aside className="flex flex-col gap-4 rounded-[24px] border border-line/80 bg-sunken/80 p-5">
              <div className="flex flex-col gap-1.5">
                <p className="m-0 text-subheading font-semibold text-ink">{T("careGuide")}</p>
                <p className="m-0 text-dense leading-relaxed text-ink-muted">
                  {t(ctrl.language, "patient.automatedGuideNotice")}
                </p>
              </div>

              {ctrl.patientTurnCount > 0 && (
                <Button
                  size="lg"
                  loading={finishing}
                  loadingLabel={T("finishing")}
                  onClick={() => void handleFinishAndReview()}
                  className="w-full"
                >
                  {`${T("finishAndReview")} →`}
                </Button>
              )}

              <Link
                href={`/${ctrl.language}/doctors`}
                className={buttonVariants({ variant: "secondary", size: "md", className: "w-full" })}
              >
                {T("skipToDoctors")}
              </Link>
            </aside>
          )}
        </div>
      )}

      {!showSideRail && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
          {ctrl.sessionId && ctrl.patientTurnCount > 0 ? (
            <Button
              size="lg"
              loading={finishing}
              loadingLabel={T("finishing")}
              onClick={() => void handleFinishAndReview()}
            >
              {`${T("finishAndReview")} →`}
            </Button>
          ) : (
            <div />
          )}
          <Link
            href={`/${ctrl.language}/doctors`}
            className={buttonVariants({ variant: "quiet", size: "md" })}
          >
            {T("skipToDoctors")}
          </Link>
        </div>
      )}
    </div>
  );
}
