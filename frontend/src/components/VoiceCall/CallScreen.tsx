"use client";

import React, { useState } from "react";
import { Keyboard, Mic, MicOff, PhoneOff } from "lucide-react";
import type { Locale } from "../../i18n/config";
import "../../i18n/call";
import { t } from "../../i18n/format";
import type { TriageCaptionEvent, VoiceSessionState } from "../../voice/types";
import { CallBlob } from "./CallBlob";
import { CallCaptions } from "./CallCaptions";
import { cn } from "../../lib/cn";

export interface CallScreenProps {
  phase: VoiceSessionState;
  language: Locale;
  turns: TriageCaptionEvent[];
  level: number;
  seconds: number;
  onMute: (muted: boolean) => void;
  onEnd: () => void;
  onSwitchToText: () => void;
}

const STATUS_KEY: Partial<Record<VoiceSessionState, string>> = {
  ringing: "ringing",
  connected: "connected",
  listening: "listening",
  speaking: "speaking",
  thinking: "thinking",
  reconnecting: "reconnecting",
  connection_lost: "lost",
};

function clock(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Modern interactive doctor-style consultation room for live voice calls (D-22).
 * Desktop: 2-column studio (presence & controls left, scrollable Q&A dialogue right).
 * Mobile: compact status header + presence orb + live dialogue + thumb-zone call dock.
 */
export function CallScreen({ phase, language, turns, level, seconds, onMute, onEnd, onSwitchToText }: CallScreenProps) {
  const [muted, setMuted] = useState(false);
  const T = (k: string) => t(language, `call.${k}`);
  const inCall = phase !== "ringing" && phase !== "connected" && phase !== "connection_lost";

  const statusDot =
    phase === "speaking"
      ? "bg-indigo"
      : phase === "listening"
        ? "bg-positive"
        : phase === "connection_lost"
          ? "bg-signal"
          : "bg-ink-muted";

  return (
    <section
      aria-label={T("voiceCall")}
      className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch"
    >
      {/* Left Presence Panel (PC) / Top Stage (Mobile) */}
      <div className="flex flex-col items-center justify-between gap-6 rounded-[28px] border border-line/80 bg-sunken/80 p-5 sm:p-8">
        <header className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-pill bg-surface px-3.5 py-1.5 ring-1 ring-line/60">
            <span aria-hidden="true" className={cn("size-2.5 rounded-pill", statusDot)} />
            <p role="status" className="m-0 text-dense font-semibold text-ink">
              {T(STATUS_KEY[phase] ?? "listening")}
            </p>
          </div>
          {inCall && (
            <p className="m-0 rounded-pill bg-surface px-3.5 py-1.5 text-dense font-semibold tabular-nums text-ink-muted ring-1 ring-line/60">
              {clock(seconds)}
            </p>
          )}
        </header>

        <div className="py-2 sm:py-4">
          <CallBlob phase={phase} level={level} />
        </div>

        {/* Floating Pill Call Dock */}
        <div className="flex w-full max-w-sm items-center justify-around rounded-[24px] border border-line/80 bg-surface px-3 py-3.5 shadow-raised">
          <CallButton
            label={muted ? T("unmute") : T("mute")}
            onClick={() => {
              setMuted(!muted);
              onMute(!muted);
            }}
            pressed={muted}
            disabled={!inCall}
          >
            {muted ? <MicOff aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
          </CallButton>
          <CallButton label={T("end")} onClick={onEnd} danger>
            <PhoneOff aria-hidden className="size-5" />
          </CallButton>
          <CallButton label={T("toText")} onClick={onSwitchToText}>
            <Keyboard aria-hidden className="size-5" />
          </CallButton>
        </div>
      </div>

      {/* Right Live Doctor-Style Q&A Dialogue Panel */}
      <div className="flex flex-col overflow-hidden rounded-[28px] border border-line/80 bg-surface">
        <div className="flex items-center justify-between border-b border-line/80 px-5 py-3.5">
          <span className="text-dense font-semibold text-ink">
            {t(language, "triage.careGuide")}
          </span>
          <span className="rounded-pill bg-sunken px-3 py-1 text-caption font-medium text-ink-muted">
            {T("captions")}
          </span>
        </div>

        <CallCaptions turns={turns} language={language} phase={phase} />

        <div className="border-t border-line/70 bg-paper/70 px-5 py-3">
          <p className="m-0 text-caption text-ink-muted">
            {t(language, "patient.automatedGuideNotice")}
          </p>
        </div>
      </div>
    </section>
  );
}

function CallButton({
  label,
  onClick,
  children,
  danger,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={label}
        className={cn(
          "grid size-14 cursor-pointer place-items-center rounded-pill transition-all duration-[var(--motion-feedback-duration)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
          danger
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "border border-line-strong bg-paper text-ink hover:border-indigo hover:bg-indigo-wash",
          pressed && "border-indigo bg-indigo-wash text-indigo",
        )}
      >
        {children}
      </button>
      <span className="text-caption font-medium text-ink-muted">{label}</span>
    </div>
  );
}
