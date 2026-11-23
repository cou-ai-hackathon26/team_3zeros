"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Info, MessageSquareText, Mic, ShieldCheck, Stethoscope, User } from "lucide-react";
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
  const endRef = useRef<HTMLDivElement>(null);
  const T = (k: string) => t(language, `triage.${k}`);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [turns.length, phase]);

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
    const items = [
      { key: "bulletMic", Icon: Mic },
      { key: "bulletText", Icon: MessageSquareText },
      { key: "bulletNotDoctor", Icon: ShieldCheck },
    ] as const;

    return (
      <section className="flex flex-col gap-6 rounded-[28px] border border-line/80 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-pill bg-indigo-wash text-indigo"
            >
              <Stethoscope className="size-5" />
            </span>
            <div>
              <h2 className="m-0 font-serif text-title tracking-[-0.02em] text-ink">{T("beforeStart")}</h2>
              <p className="m-0 mt-1 text-dense leading-relaxed text-ink-muted">{T("beforeStartSubtitle")}</p>
            </div>
          </div>
          <LanguageSwitch locale={language} onChange={onLanguageChange} skipNavigation />
        </div>

        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
          {items.map(({ key, Icon }) => (
            <li
              key={key}
              className="flex flex-col gap-2.5 rounded-[20px] bg-sunken/70 p-4 text-dense leading-relaxed text-ink"
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-pill bg-surface text-indigo"
              >
                <Icon className="size-4" />
              </span>
              <span>{T(key)}</span>
            </li>
          ))}
        </ul>

        {errorMessage && <Alert tone="attention" title={errorMessage} />}

        <label className="flex min-h-12 cursor-pointer items-start gap-3.5 rounded-[18px] border border-line bg-paper px-4 py-3.5 text-body transition-colors hover:border-indigo/40">
          <input
            type="checkbox"
            checked={disclosureAccepted}
            onChange={(e) => setDisclosureAccepted(e.target.checked)}
            className="mt-1 size-5 shrink-0 cursor-pointer accent-indigo"
          />
          <span className="leading-snug text-ink">{T("disclosureAgree")}</span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {preferText ? (
            <>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={cn(BTN.primary, "w-full sm:w-auto")}
                onClick={onSwitchToText}
              >
                {T("startWriting")}
              </button>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={cn(BTN.secondary, "w-full sm:w-auto")}
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
                className={cn(BTN.primary, "w-full sm:w-auto")}
                onClick={onAllowMicrophone}
              >
                <Mic aria-hidden="true" className="size-4" />
                <span>{T("allowMicrophone")}</span>
              </button>
              <button
                type="button"
                disabled={!disclosureAccepted}
                className={cn(BTN.secondary, "w-full sm:w-auto")}
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
      <section className="flex flex-col gap-5 rounded-[28px] border border-line/80 bg-surface p-6 sm:p-8">
        <h2 className="m-0 font-serif text-title text-ink">{T("micBlocked")}</h2>
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
    <section className="flex flex-col overflow-hidden rounded-[28px] border border-line/80 bg-surface">
      {/* Consultation Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 bg-paper/60 px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" className={BTN.quiet} onClick={onEnd}>
            {`← ${T("end")}`}
          </button>
          <span className="inline-flex items-center gap-2 rounded-pill bg-indigo-wash px-3.5 py-1.5 text-caption font-semibold text-indigo">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-pill",
                phase === "speaking" ? "bg-indigo" : phase === "thinking" ? "bg-ochre" : "bg-positive",
              )}
            />
            {textMode
              ? T("writtenIntake")
              : `${T("voiceCall")}, ${formatCallDuration(callSeconds)}`}
          </span>
        </div>

        <LanguageSwitch locale={language} onChange={onLanguageChange} skipNavigation />
      </div>

      {/* Notices & Alerts */}
      {(phase === "unsupported_browser" || (!textMode && voicePlaceholderActive) || errorMessage) && (
        <div className="flex flex-col gap-3 border-b border-line/70 px-4 py-3.5 sm:px-6">
          {phase === "unsupported_browser" && <Alert tone="info" title={T("micUnsupported")} />}

          {!textMode && voicePlaceholderActive && (
            <div
              role="note"
              className="flex items-start gap-3 rounded-[18px] border border-dashed border-draft bg-draft-wash p-3.5 text-dense text-ink"
            >
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-draft" />
              <div className="flex flex-col gap-1">
                <strong className="font-semibold">{T("voicePlaceholderTitle")}</strong>
                <p className="m-0 text-dense">{T("voicePlaceholderBody")}</p>
              </div>
            </div>
          )}

          {errorMessage && <Alert tone="attention" title={errorMessage} />}
        </div>
      )}

      {/* Doctor-Style Live Q&A Conversation Stream */}
      <div
        role="log"
        aria-live="polite"
        className="flex min-h-[260px] max-h-[420px] flex-col gap-3.5 overflow-y-auto bg-paper/50 px-4 py-5 sm:px-6"
      >
        {turns.length === 0 ? (
          <div className="flex items-end gap-2.5">
            <span
              aria-hidden="true"
              className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-pill bg-indigo-wash text-indigo"
            >
              <Stethoscope className="size-4" />
            </span>
            <div className="max-w-[85%] rounded-[20px] border border-indigo/20 bg-surface px-4 py-3.5">
              <span className="text-caption font-semibold text-ink-muted">{T("careGuide")}</span>
              <p className="m-0 mt-1 text-heading font-semibold text-ink">{T("defaultPrompt")}</p>
            </div>
          </div>
        ) : (
          turns.map((turn, i) => {
            const isAssistant = turn.role === "assistant";
            const isLatestAssistant = isAssistant && i === turns.length - 1;
            return (
              <div
                key={`${turn.at}-${i}`}
                className={cn(
                  "flex items-end gap-2.5",
                  isAssistant ? "justify-start" : "justify-end",
                )}
              >
                {isAssistant && (
                  <span
                    aria-hidden="true"
                    className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-pill bg-indigo-wash text-indigo"
                  >
                    <Stethoscope className="size-4" />
                  </span>
                )}

                <div
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1 rounded-[20px] px-4 py-3",
                    isAssistant
                      ? isLatestAssistant
                        ? "border border-indigo/25 bg-surface text-ink"
                        : "bg-surface/90 text-ink ring-1 ring-line/60"
                      : "bg-indigo-wash text-ink",
                  )}
                >
                  <span className="text-caption font-semibold text-ink-muted">
                    {isAssistant ? T("careGuide") : T("you")}
                  </span>
                  <p
                    className={cn(
                      "m-0 leading-relaxed",
                      isLatestAssistant ? "text-heading font-semibold text-ink" : "text-body text-ink",
                    )}
                  >
                    {turn.text}
                  </p>
                </div>

                {!isAssistant && (
                  <span
                    aria-hidden="true"
                    className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-muted"
                  >
                    <User className="size-4" />
                  </span>
                )}
              </div>
            );
          })
        )}

        {interimText && (
          <div className="flex items-end justify-end gap-2.5">
            <div className="max-w-[85%] rounded-[20px] border border-dashed border-indigo/40 bg-indigo-wash/60 px-4 py-2.5 text-body text-ink-muted">
              {`${T("listening")}: “${interimText}”`}
            </div>
          </div>
        )}

        {phase === "thinking" && (
          <div className="flex items-end gap-2.5">
            <span
              aria-hidden="true"
              className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-pill bg-indigo-wash text-indigo"
            >
              <Stethoscope className="size-4" />
            </span>
            <div className="inline-flex items-center gap-1.5 rounded-[20px] bg-surface px-4 py-3 ring-1 ring-line/60">
              <span className="size-2 rounded-pill bg-indigo/60 animate-pulse" />
              <span className="size-2 rounded-pill bg-indigo/60 animate-pulse [animation-delay:150ms]" />
              <span className="size-2 rounded-pill bg-indigo/60 animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Live Status + Audio Meter + Quick Replies + Pill Composer */}
      <div className="flex flex-col gap-4 border-t border-line/80 bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption font-semibold text-ink-muted" role="status">
              {statusText}
            </span>
            {turns.length > 1 && (
              <span className="text-caption tabular-nums text-ink-muted">
                {fill(T("showConversation"), { n: turns.length })}
              </span>
            )}
          </div>

          {!textMode && (
            <div
              role="meter"
              aria-label={T("micLevel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}
              className="h-2 w-full overflow-hidden rounded-pill bg-sunken"
            >
              <div
                className="h-full rounded-pill bg-indigo transition-all duration-100"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Interactive Quick-Reply Symptom Chips */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-ink-muted">{T("commonSymptoms")}</span>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((p) => (
              <button
                key={p.text}
                type="button"
                className={cn(
                  "min-h-10 cursor-pointer rounded-pill border px-3.5 py-1.5 text-dense font-medium transition-all duration-[var(--motion-feedback-duration)] active:scale-[0.98]",
                  p.emergency
                    ? "border-signal/60 bg-signal-wash/60 text-signal hover:border-signal hover:bg-signal-wash"
                    : "border-line-strong/60 bg-paper text-ink hover:border-indigo hover:bg-indigo-wash",
                )}
                onClick={() => onSendTextTurn(p.text)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modern Pill Composer */}
        <form className="flex items-center gap-2" onSubmit={handleTextSubmit}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={textMode ? T("placeholderText") : T("placeholderVoice")}
            className="h-12 min-w-0 flex-1 rounded-pill border border-line-strong bg-paper px-5 text-body text-ink transition-colors focus:border-indigo focus:bg-surface"
          />
          <button
            type="submit"
            className={cn(BTN.primary, "h-12 shrink-0 px-5")}
          >
            <span>{T("send")}</span>
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
        </form>

        {!textMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className={BTN.secondary}
                onClick={phase === "paused" || phase === "ended" ? onResume : onPause}
              >
                {phase === "paused" ? T("resume") : T("pause")}
              </button>

              {audioDevices.length > 1 && (
                <select
                  className="h-11 rounded-pill border border-line-strong bg-surface px-3.5 text-dense"
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
      </div>
    </section>
  );
}
