"use client";

import React, { useState } from "react";
import { Info, Mic } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { fill } from "../../features/patient/display";
import type {
  TriageCaptionEvent,
  VoiceProviderConfig,
  VoiceSessionState,
} from "../../voice/types";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { buttonVariants } from "../ui/button";
import { Alert } from "../ui/states";
import { cn } from "../../lib/cn";

const BTN = {
  primary: buttonVariants({ variant: "primary", size: "lg" }),
  secondary: buttonVariants({ variant: "secondary", size: "md" }),
  quiet: buttonVariants({ variant: "quiet", size: "md" }),
};

export interface VoicePanelProps {
  phase: VoiceSessionState;
  language: Locale;
  turns: TriageCaptionEvent[];
  micLevel: number;
  textMode?: boolean;
  preferredMode?: "voice" | "text";
  voicePlaceholderActive?: boolean;
  errorMessage?: string | null;
  interimText?: string;
  callSeconds?: number;
  providerConfig?: VoiceProviderConfig;
  audioDevices?: Array<{ deviceId: string; label: string }>;
  onUpdateProvider?: (patch: Partial<VoiceProviderConfig>) => void;
  onBargeIn?: () => void;
  onLanguageChange: (lang: Locale) => void;
  onAllowMicrophone: () => void;
  onSwitchToText: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onSendTextTurn: (text: string) => void;
}

function formatCallDuration(totalSeconds = 0): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * UIUX §6.2 & FRONTEND §8:
 * - Explicit disclosure confirmation before starting either voice or text triage (MASTERPLAN §6.3).
 * - Clean Vapi voice-agent placeholder notice when voice mode is active, paired with live text triage.
 * - Live level meter driven by microphone amplitude (no orb), always-on captions, and recovery steps.
 */
export function VoicePanel({
  phase,
  language,
  turns,
  micLevel,
  textMode = false,
  preferredMode = "voice",
  voicePlaceholderActive = false,
  errorMessage = null,
  interimText = "",
  callSeconds = 0,
  providerConfig = { provider: "vapi_placeholder", speakerEnabled: true },
  audioDevices = [],
  onUpdateProvider,
  onLanguageChange,
  onAllowMicrophone,
  onSwitchToText,
  onPause,
  onResume,
  onEnd,
  onSendTextTurn,
}: VoicePanelProps) {
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const T = (k: string) => t(language, `triage.${k}`);

  const lastAssistantTurn = [...turns].reverse().find((turn) => turn.role === "assistant");
  const lastPatientTurn = [...turns].reverse().find((turn) => turn.role === "patient");

  const quickPrompts =
    language === "bn"
      ? [
          { label: "৩ দিন ধরে জ্বর ও মাথাব্যথা", text: "আমার ৩ দিন ধরে জ্বর এবং মাথাব্যথা হচ্ছে", emergency: false },
          { label: "মাথা ঘোরা ও শারীরিক দুর্বলতা", text: "কয়েকদিন ধরে মাথা ঘুরছে এবং শরীর খুব দুর্বল লাগছে", emergency: false },
          { label: "পেটে ব্যথা ও বমি ভাব", text: "গতকাল থেকে পেটে মাঝারি ব্যথা এবং বমি ভাব আছে", emergency: false },
          { label: "ডায়াবেটিস বা উচ্চ রক্তচাপ নেই", text: "আমার ডায়াবেটিস বা উচ্চ রক্তচাপের কোনো সমস্যা নেই", emergency: false },
          { label: "বুকে তীব্র ব্যথা ও শ্বাসকষ্ট", text: "আমার বুকে তীব্র ব্যথা এবং শ্বাস নিতে কষ্ট হচ্ছে", emergency: true },
        ]
      : [
          { label: "Fever & headache for 3 days", text: "I have had a fever and headache for 3 days", emergency: false },
          { label: "Dizziness & fatigue", text: "I feel dizzy and very weak since yesterday", emergency: false },
          { label: "Stomach pain & mild nausea", text: "Moderate stomach pain with mild nausea for 2 days", emergency: false },
          { label: "No diabetes or high BP", text: "No history of diabetes or high blood pressure", emergency: false },
          { label: "Severe chest pain & breathlessness", text: "I am having severe chest pain and struggling to breathe", emergency: true },
        ];

  if (phase === "permission_prompt" && !textMode) {
    const preferText = preferredMode === "text";
    return (
      <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-serif text-title">{T("beforeStart")}</h2>
            <p className="m-0 mt-1 text-dense text-ink-muted">{T("beforeStartSubtitle")}</p>
          </div>
          <LanguageSwitch locale={language} onChange={onLanguageChange} />
        </div>

        <ul className="m-0 flex list-disc flex-col gap-2 ps-5 text-body">
          <li>{T("bulletMic")}</li>
          <li>{T("bulletText")}</li>
          <li>{T("bulletNotDoctor")}</li>
        </ul>

        {errorMessage && <Alert tone="attention" title={errorMessage} />}

        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-body">
          <input
            type="checkbox"
            checked={disclosureAccepted}
            onChange={(e) => setDisclosureAccepted(e.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>{T("disclosureAgree")}</span>
        </label>

        <div className="flex flex-wrap gap-3">
          {preferText ? (
            <>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={BTN.primary}
                onClick={onSwitchToText}
              >
                {T("startWriting")}
              </button>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={BTN.secondary}
                onClick={onAllowMicrophone}
              >
                <Mic aria-hidden="true" className="size-4" />
                <span>{T("allowMicrophone")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={BTN.primary}
                onClick={onAllowMicrophone}
              >
                <Mic aria-hidden="true" className="size-4" />
                <span>{T("allowMicrophone")}</span>
              </button>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={BTN.secondary}
                onClick={onSwitchToText}
              >
                {T("typeInstead")}
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  if (phase === "permission_denied" && !textMode) {
    return (
      <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
        <h2 className="m-0 font-serif text-title">{T("micBlocked")}</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={BTN.primary} onClick={onSwitchToText}>
            {T("typeInstead")}
          </button>
        </div>
      </section>
    );
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    onSendTextTurn(textInput.trim());
    setTextInput("");
  }

  const statusText =
    phase === "thinking"
      ? T("thinking")
      : phase === "speaking"
        ? T("speaking")
        : phase === "reconnecting"
          ? T("reconnecting")
          : phase === "paused"
            ? T("paused")
            : textMode
              ? T("ready")
              : T("listening");

  return (
    <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN.quiet} onClick={onEnd}>
            {`← ${T("end")}`}
          </button>
          <span className="inline-flex items-center gap-2 rounded-control bg-indigo-wash px-3 py-1 text-caption font-semibold">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-pill", phase === "speaking" ? "bg-indigo" : "bg-ink-muted")}
            />
            {textMode
              ? T("writtenIntake")
              : `${T("voiceCall")}, ${formatCallDuration(callSeconds)}`}
          </span>
        </div>

        <LanguageSwitch locale={language} onChange={onLanguageChange} />
      </div>

      {phase === "unsupported_browser" && (
        <Alert tone="info" title={T("micUnsupported")} />
      )}

      {!textMode && voicePlaceholderActive && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-panel border border-dashed border-draft bg-draft-wash p-3 text-dense text-ink"
        >
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-draft" />
          <div className="flex flex-col gap-1">
            <strong className="font-semibold">{T("voicePlaceholderTitle")}</strong>
            <p className="m-0 text-dense">{T("voicePlaceholderBody")}</p>
          </div>
        </div>
      )}

      {errorMessage && <Alert tone="attention" title={errorMessage} />}

      <div className="flex flex-col gap-3">
        <span className="text-caption font-semibold text-ink-muted">{T("careGuide")}</span>

        {lastAssistantTurn ? (
          <p className="m-0 text-title font-medium">{lastAssistantTurn.text}</p>
        ) : (
          <p className="m-0 text-title font-medium">{T("defaultPrompt")}</p>
        )}

        {interimText && (
          <p className="m-0 text-body text-ink-muted">
            {`${T("listening")}: “${interimText}”`}
          </p>
        )}

        {lastPatientTurn && (
          <p className="m-0 text-dense text-ink-muted">
            {`${T("yourResponse")} “${lastPatientTurn.text}”`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-dense font-semibold" role="status">
            {statusText}
          </span>

          {turns.length > 1 && (
            <button
              type="button"
              className={BTN.quiet}
              onClick={() => setShowTranscript((v) => !v)}
            >
              {showTranscript
                ? T("hideConversation")
                : fill(T("showConversation"), { n: turns.length })}
            </button>
          )}
        </div>

        {!textMode && (
          <div
            role="meter"
            aria-label={T("micLevel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}
            className="h-2 w-full overflow-hidden rounded-control bg-sunken"
          >
            <div
              className="h-full bg-indigo"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {showTranscript && turns.length > 0 && (
        <div className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-panel bg-sunken p-3">
          {turns.map((turn, i) => (
            <div key={`${turn.at}-${i}`} className="flex flex-col text-dense">
              <span className="text-caption font-semibold text-ink-muted">
                {turn.role === "assistant" ? T("careGuide") : T("you")}
              </span>
              <span>{turn.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-caption text-ink-muted">{T("commonSymptoms")}</span>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((p) => (
            <button
              key={p.text}
              type="button"
              className={cn(
                "min-h-11 rounded-control border bg-surface px-3 text-dense hover:bg-sunken",
                p.emergency ? "border-signal text-signal" : "border-line-strong text-ink",
              )}
              onClick={() => onSendTextTurn(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <form className="flex gap-2" onSubmit={handleTextSubmit}>
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={textMode ? T("placeholderText") : T("placeholderVoice")}
          className="h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-body"
        />
        <button type="submit" className={BTN.primary}>
          {T("send")}
        </button>
      </form>

      {!textMode && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={BTN.secondary}
              onClick={phase === "paused" || phase === "ended" ? onResume : onPause}
            >
              {phase === "paused" ? T("resume") : T("pause")}
            </button>

            {audioDevices.length > 1 && (
              <select
                className="h-11 rounded-control border border-line-strong bg-surface px-2 text-dense"
                value={providerConfig.selectedDeviceId ?? ""}
                onChange={(e) => onUpdateProvider?.({ selectedDeviceId: e.target.value })}
                aria-label={T("selectMic")}
              >
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button type="button" className={BTN.quiet} onClick={onSwitchToText}>
            {T("typeInstead")}
          </button>
        </div>
      )}
    </section>
  );
}
