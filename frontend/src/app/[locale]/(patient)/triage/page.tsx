"use client";

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTriageSessionController } from "../../../../voice/controller";
import { VoicePanel } from "../../../../components/VoicePanel/VoicePanel";
import { EmergencyScreen } from "../../../../components/EmergencyScreen/EmergencyScreen";
import { DraftBlock } from "../../../../components/DraftBlock/DraftBlock";
import { RouteLine } from "../../../../components/RouteLine/RouteLine";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

/**
 * UIUX §6.2 & §6.3, FRONTEND §7:
 * Interactive Voice Triage screen with:
 * - Immediate priority interrupt to static EmergencyScreen (INV-8).
 * - Real-time clinical intake draft preview (DraftBlock) that updates turn by turn.
 */
export default function TriagePage({ params }: LocalePageProps) {
  const initialLocale = usePageLocale(params, "bn");
  const ctrl = useTriageSessionController(initialLocale);

  let modeParam: string | null = null;
  try {
    const searchParams = useSearchParams();
    modeParam = searchParams?.get("mode") ?? null;
  } catch {
    modeParam = null;
  }

  useEffect(() => {
    if (modeParam === "text" && !ctrl.textMode) {
      void ctrl.switchToText();
    }
  }, [modeParam, ctrl]);

  if (ctrl.phase === "emergency" || ctrl.emergencyInstruction) {
    return (
      <EmergencyScreen
        instructionText={
          ctrl.emergencyInstruction ??
          "PLACEHOLDER — NOT CLINICALLY APPROVED: Go to the nearest emergency hospital immediately."
        }
        locale={ctrl.language}
      />
    );
  }

  const triageRouteState =
    ctrl.phase === "permission_prompt"
      ? "CREATED"
      : ctrl.draftSummary.turnCount >= 2
        ? "SUMMARY_PENDING_REVIEW"
        : "ACTIVE";

  return (
    <main className={styles.pageShell}>
      <div className={styles.heroHeader}>
        <h1 className={styles.pageTitle}>
          {ctrl.language === "bn"
            ? "কথা বলে আপনার শারীরিক সমস্যার কথা জানান"
            : "Tell us your symptoms in your own voice"}
        </h1>
        <RouteLine
          entity="triage_session"
          currentState={triageRouteState}
          objectId={ctrl.sessionId}
          variant="clinician"
          locale={ctrl.language}
        />
      </div>

      <VoicePanel
        phase={ctrl.phase}
        language={ctrl.language}
        turns={ctrl.turns}
        micLevel={ctrl.micLevel}
        textMode={ctrl.textMode}
        interimText={ctrl.interimText}
        callSeconds={ctrl.callSeconds}
        providerConfig={ctrl.providerConfig}
        audioDevices={ctrl.audioDevices}
        onUpdateProvider={ctrl.updateProvider}
        onBargeIn={ctrl.bargeIn}
        onLanguageChange={ctrl.setLanguage}
        onAllowMicrophone={ctrl.allowMicrophone}
        onSwitchToText={ctrl.switchToText}
        onPause={ctrl.pause}
        onResume={ctrl.resume}
        onEnd={ctrl.end}
        onSendTextTurn={ctrl.sendTextTurn}
      />

      {ctrl.draftSummary.turnCount > 0 && (
        <DraftBlock
          title={
            ctrl.language === "bn"
              ? "লাইভ খসড়া সারাংশ (কথোপকথনের সাথে স্বয়ংক্রিয়ভাবে আপডেট হচ্ছে)"
              : "Live Clinical Intake Draft (auto-updating from your voice call)"
          }
          locale={ctrl.language}
        >
          <div className={styles.gridCards}>
            <div>
              <strong>
                {ctrl.language === "bn" ? "প্রধান সমস্যা:" : "Chief complaint:"}
              </strong>{" "}
              {ctrl.draftSummary.chiefComplaint}
            </div>
            <div>
              <strong>
                {ctrl.language === "bn" ? "সময়কাল ও তীব্রতা:" : "Duration & severity:"}
              </strong>{" "}
              {ctrl.draftSummary.duration} • {ctrl.draftSummary.severity}
            </div>
            <div>
              <strong>
                {ctrl.language === "bn" ? "প্রস্তাবিত বিভাগ:" : "Suggested specialty:"}
              </strong>{" "}
              {ctrl.language === "bn"
                ? ctrl.draftSummary.suggestedSpecialtyBn
                : ctrl.draftSummary.suggestedSpecialtyEn}
            </div>
            <div>
              <strong>
                {ctrl.language === "bn" ? "জরুরি লক্ষণ যাচাই:" : "Red-flag check:"}
              </strong>{" "}
              {ctrl.draftSummary.redFlagStatus}
            </div>
          </div>
        </DraftBlock>
      )}

      <div className={styles.topBar}>
        <a
          href={`/${ctrl.language}/triage/summary/${ctrl.sessionId}`}
          className={styles.primaryCta}
        >
          {ctrl.language === "bn"
            ? "প্রশ্নোত্তর শেষ — সারাংশ যাচাই করুন →"
            : "Finish & review summary →"}
        </a>
        <a href={`/${ctrl.language}/doctors`} className={styles.secondaryCta}>
          {ctrl.language === "bn" ? "সরাসরি ডাক্তার খুঁজুন" : "Skip to doctor discovery"}
        </a>
      </div>
    </main>
  );
}
