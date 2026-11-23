"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTriageSessionController } from "../../../../voice/controller";
import { VoicePanel } from "../../../../components/VoicePanel/VoicePanel";
import { EmergencyScreen } from "../../../../components/EmergencyScreen/EmergencyScreen";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "../../../usePageLocale";
import { PageHeader } from "../../../../components/ui/surfaces";
import { buttonVariants } from "../../../../components/ui/button";

/**
 * UIUX §6.2 & §6.3, FRONTEND §7:
 * Interactive Voice Triage screen with:
 * - Immediate priority interrupt to static EmergencyScreen (INV-8).
 * - Focused conversational interface (clinical draft and provider settings stripped from patient view per audit A-12).
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

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        serif
        title={
          ctrl.language === "bn"
            ? "কথা বলে আপনার শারীরিক সমস্যার কথা জানান"
            : "Tell us your symptoms in your own voice"
        }
        context={
          ctrl.language === "bn"
            ? "আপনার লক্ষণ অনুযায়ী সঠিক বিশেষজ্ঞ ডাক্তার খুঁজে পেতে সাহায্য করা হবে"
            : "We will help guide you to a suitable specialist doctor based on your symptoms"
        }
      />

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

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        {ctrl.draftSummary.turnCount > 0 ? (
          <Link
            href={`/${ctrl.language}/triage/summary/${ctrl.sessionId}`}
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            {ctrl.language === "bn"
              ? "প্রশ্নোত্তর শেষ — সারাংশ যাচাই করুন →"
              : "Finish & review summary →"}
          </Link>
        ) : (
          <div />
        )}
        <Link
          href={`/${ctrl.language}/doctors`}
          className={buttonVariants({ variant: "quiet", size: "md" })}
        >
          {ctrl.language === "bn" ? "সরাসরি ডাক্তার খুঁজুন" : "Skip to doctor discovery"}
        </Link>
      </div>
    </main>
  );
}
