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

/** Full-height phone-call view: status, Siri-style blob, live bilingual captions, call controls (D-22). */
export function CallScreen({ phase, language, turns, level, seconds, onMute, onEnd, onSwitchToText }: CallScreenProps) {
  const [muted, setMuted] = useState(false);
  const T = (k: string) => t(language, `call.${k}`);
  const inCall = phase !== "ringing" && phase !== "connected" && phase !== "connection_lost";
  return (
    <section aria-label={T("voiceCall")} className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-between gap-6 py-6">
      <header className="text-center">
        <p role="status" className="text-heading font-semibold text-ink">
          {T(STATUS_KEY[phase] ?? "listening")}
        </p>
        {inCall && <p className="mt-1 text-dense tabular-nums text-ink-muted">{clock(seconds)}</p>}
      </header>

      <CallBlob phase={phase} level={level} />

      <CallCaptions turns={turns} language={language} />

      <div className="flex w-full max-w-sm items-center justify-around">
        <CallButton label={muted ? T("unmute") : T("mute")} onClick={() => {
          setMuted(!muted);
          onMute(!muted);
        }} pressed={muted} disabled={!inCall}>
          {muted ? <MicOff aria-hidden className="size-6" /> : <Mic aria-hidden className="size-6" />}
        </CallButton>
        <CallButton label={T("end")} onClick={onEnd} danger>
          <PhoneOff aria-hidden className="size-6" />
        </CallButton>
        <CallButton label={T("toText")} onClick={onSwitchToText}>
          <Keyboard aria-hidden className="size-6" />
        </CallButton>
      </div>
    </section>
  );
}

function CallButton({ label, onClick, children, danger, pressed, disabled }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; pressed?: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={label}
        className={cn(
          "grid size-16 place-items-center rounded-pill transition-colors disabled:opacity-40",
          danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "border border-line-strong bg-surface text-ink hover:bg-sunken",
          pressed && "bg-indigo-wash",
        )}
      >
        {children}
      </button>
      <span className="text-caption text-ink-muted">{label}</span>
    </div>
  );
}
