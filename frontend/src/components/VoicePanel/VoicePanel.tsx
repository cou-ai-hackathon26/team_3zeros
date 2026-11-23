"use client";

import React, { useState } from "react";
import type { Locale } from "../../i18n/config";
import type {
  TriageCaptionEvent,
  VoiceProviderConfig,
  VoiceSessionState,
} from "../../voice/types";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { buttonVariants } from "../ui/button";
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

function MicSvg() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function SpeakerSvg({ muted }: { muted: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

/**
 * UIUX §6.2 & FRONTEND §7:
 * - Permission explainer before getUserMedia (INV-2).
 * - Live level meter driven by microphone amplitude (no glowing orb).
 * - Always-on live captions (assistant 24px width 106, patient ink-muted, plus live interim speech).
 * - Actionable, non-apologetic recovery steps on permission_denied or unsupported_browser.
 */
export function VoicePanel({
  phase,
  language,
  turns,
  micLevel,
  textMode = false,
  interimText = "",
  callSeconds = 0,
  providerConfig = { provider: "browser_speech", speakerEnabled: true },
  audioDevices = [],
  onUpdateProvider,
  onBargeIn,
  onLanguageChange,
  onAllowMicrophone,
  onSwitchToText,
  onPause,
  onResume,
  onEnd,
  onSendTextTurn,
}: VoicePanelProps) {
  const [disclosureAccepted, setDisclosureAccepted] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);

  const lastAssistantTurn = [...turns].reverse().find((t) => t.role === "assistant");
  const lastPatientTurn = [...turns].reverse().find((t) => t.role === "patient");

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
    return (
      <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-serif text-title">
              {language === "bn" ? "শুরু করার আগে" : "Before we start"}
            </h2>
            <p className="m-0 mt-1 text-dense text-ink-muted">
              {language === "bn"
                ? "সরাসরি কথা বলে বা লিখে আপনার শারীরিক সমস্যার সারাংশ তৈরি করুন"
                : "Speak naturally or type to prepare your visit summary for the doctor"}
            </p>
          </div>
          <LanguageSwitch locale={language} onChange={onLanguageChange} />
        </div>

        <ul className="m-0 flex list-disc flex-col gap-2 ps-5 text-body">
          <li>
            {language === "bn"
              ? "শুধুমাত্র এই স্ক্রিনটি খোলা থাকাকালীন আপনার মাইক্রোফোন ব্যবহার করা হবে।"
              : "We use your microphone only while this screen is open."}
          </li>
          <li>
            {language === "bn"
              ? "আপনি যা বলবেন তা লেখায় রূপান্তরিত করে ডাক্তারের সারাংশ তৈরির জন্য সংরক্ষণ করা হবে।"
              : "What you say is turned into text and saved for your doctor summary."}
          </li>
          <li>
            {language === "bn"
              ? "এটি একটি স্বয়ংক্রিয় নির্দেশিকা, ডাক্তার নয়।"
              : "This is an automated guide, not a doctor."}
          </li>
        </ul>

        <label className="flex items-start gap-3 text-body">
          <input
            type="checkbox"
            checked={disclosureAccepted}
            onChange={(e) => setDisclosureAccepted(e.target.checked)}
          />
          <span>
            {language === "bn"
              ? "আমি বুঝতে পেরেছি এটি একটি স্বয়ংক্রিয় নির্দেশিকা এবং কথা বলা শুরু করতে সম্মত"
              : "I understand this is an automated triage guide and agree to proceed"}
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!disclosureAccepted}
            className={BTN.primary}
            onClick={onAllowMicrophone}
          >
            <MicSvg />
            <span>
              {language === "bn" ? "মাইক্রোফোন চালু করুন" : "Allow microphone"}
            </span>
          </button>
          <button
            type="button"
            className={BTN.secondary}
            onClick={onSwitchToText}
          >
            {language === "bn" ? "লিখে জানান" : "Type instead"}
          </button>
        </div>
      </section>
    );
  }

  if (phase === "permission_denied" && !textMode) {
    return (
      <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
        <h2 className="m-0 font-serif text-title">
          {language === "bn"
            ? "মাইক্রোফোন ব্লক করা আছে। ব্রাউজার সেটিংস থেকে চালু করুন অথবা নিচে লিখে জানান।"
            : "Microphone is blocked. Turn it on in your browser settings, or type instead."}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={BTN.primary}
            onClick={onSwitchToText}
          >
            {language === "bn" ? "লিখে জানান" : "Type instead"}
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

  const isMuted = providerConfig.speakerEnabled === false;

  return (
    <section className="flex flex-col gap-5 rounded-tile border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN.quiet} onClick={onEnd}>
            {language === "bn" ? "← শেষ করুন" : "← End"}
          </button>
          <span className="inline-flex items-center gap-2 rounded-control bg-indigo-wash px-3 py-1 text-caption font-semibold">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-pill", phase === "speaking" ? "bg-indigo" : "bg-ink-muted")}
            />
            {textMode
              ? language === "bn"
                ? "লিখিত প্রশ্নোত্তর"
                : "Written Intake"
              : `${language === "bn" ? "ভয়েস কল চালু" : "Voice Call"} • ${formatCallDuration(callSeconds)}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!textMode && (
            <button
              type="button"
              className={BTN.secondary}
              onClick={() =>
                onUpdateProvider?.({
                  speakerEnabled: isMuted,
                })
              }
            >
              <SpeakerSvg muted={isMuted} />
              <span>
                {isMuted
                  ? language === "bn"
                    ? "অডিও বন্ধ"
                    : "Muted"
                  : language === "bn"
                    ? "অডিও চালু"
                    : "Voice On"}
              </span>
            </button>
          )}
          <LanguageSwitch locale={language} onChange={onLanguageChange} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption font-semibold text-ink-muted">
            {language === "bn" ? "স্বাস্থ্য নির্দেশিকা" : "Care Guide"}
          </span>
          {phase === "speaking" && onBargeIn && (
            <button
              type="button"
              className={BTN.secondary}
              onClick={onBargeIn}
            >
              <MicSvg />
              <span>
                {language === "bn" ? "এখনই উত্তর দিন" : "Speak now"}
              </span>
            </button>
          )}
        </div>

        {lastAssistantTurn ? (
          <p className="m-0 text-title font-medium">{lastAssistantTurn.text}</p>
        ) : (
          <p className="m-0 text-title font-medium">
            {language === "bn"
              ? "আপনার কী শারীরিক সমস্যা হচ্ছে, নিজের ভাষায় বলুন…"
              : "Please describe what symptoms you are experiencing today…"}
          </p>
        )}

        {interimText && (
          <p className="m-0 text-body text-ink-muted">
            {language === "bn" ? "শুনছি: " : "Listening: "}“{interimText}”
          </p>
        )}

        {lastPatientTurn && (
          <p className="m-0 text-dense text-ink-muted">
            {language === "bn" ? "আপনার উত্তর: " : "Your response: "}“
            {lastPatientTurn.text}”
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-dense font-semibold" role="status">
            {phase === "thinking"
              ? language === "bn"
                ? "বিবেচনা করা হচ্ছে…"
                : "Thinking…"
              : phase === "speaking"
                ? language === "bn"
                  ? "নির্দেশিকা কথা বলছে…"
                  : "Speaking…"
                : phase === "reconnecting"
                  ? language === "bn"
                    ? "পুনরায় সংযোগ করা হচ্ছে…"
                    : "Reconnecting…"
                  : phase === "paused"
                    ? language === "bn"
                      ? "বিরতি দেওয়া হয়েছে"
                      : "Paused"
                    : language === "bn"
                      ? "শুনছি"
                      : "Listening"}
          </span>

          {turns.length > 1 && (
            <button
              type="button"
              className={BTN.quiet}
              onClick={() => setShowTranscript((v) => !v)}
            >
              {showTranscript
                ? language === "bn"
                  ? "কথোপকথন লুকান"
                  : "Hide conversation"
                : language === "bn"
                  ? `কথোপকথন দেখুন (${turns.length})`
                  : `Conversation history (${turns.length})`}
            </button>
          )}
        </div>

        {/* Live level: a segment that fills with microphone amplitude (no orb, no waveform). */}
        <div
          role="meter"
          aria-label={language === "bn" ? "মাইক্রোফোনের মাত্রা" : "Microphone level"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}
          className="h-2 w-full overflow-hidden rounded-control bg-sunken"
        >
          <div className="h-full bg-indigo" style={{ width: `${Math.round(Math.min(1, Math.max(0, micLevel)) * 100)}%` }} />
        </div>
      </div>

      {showTranscript && turns.length > 0 && (
        <div className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-panel bg-sunken p-3">
          {turns.map((t, i) => (
            <div key={`${t.at}-${i}`} className="flex flex-col text-dense">
              <span className="text-caption font-semibold text-ink-muted">
                {t.role === "assistant"
                  ? language === "bn"
                    ? "নির্দেশিকা"
                    : "Care Guide"
                  : language === "bn"
                    ? "আপনি"
                    : "You"}
              </span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-caption text-ink-muted">
          {language === "bn"
            ? "সাধারণ লক্ষণ (চাপলে সাথে সাথে উত্তর পাঠানো হবে):"
            : "Common symptoms (tap to answer immediately):"}
        </span>
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
          placeholder={
            textMode
              ? language === "bn"
                ? "আপনার সমস্যা লিখুন…"
                : "Describe your symptoms…"
              : language === "bn"
                ? "কথা বলুন অথবা এখানে লিখে পাঠান…"
                : "Speak or type your answer here…"
          }
          className="h-12 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 text-body"
        />
        <button type="submit" className={BTN.primary}>
          {language === "bn" ? "পাঠান" : "Send"}
        </button>
      </form>

      {!textMode && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={BTN.secondary}
              onClick={
                phase === "paused" || phase === "ended" ? onResume : onPause
              }
            >
              {phase === "paused"
                ? language === "bn"
                  ? "পুনরায় শুরু করুন"
                  : "Resume"
                : language === "bn"
                  ? "বিরতি"
                  : "Pause"}
            </button>

            {audioDevices.length > 1 && (
              <select
                className="h-11 rounded-control border border-line-strong bg-surface px-2 text-dense"
                value={providerConfig.selectedDeviceId ?? ""}
                onChange={(e) =>
                  onUpdateProvider?.({ selectedDeviceId: e.target.value })
                }
                aria-label={
                  language === "bn"
                    ? "মাইক্রোফোন নির্বাচন করুন"
                    : "Select microphone"
                }
              >
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            className={BTN.quiet}
            onClick={onSwitchToText}
          >
            {language === "bn" ? "লিখে জানান" : "Type instead"}
          </button>
        </div>
      )}
    </section>
  );
}
