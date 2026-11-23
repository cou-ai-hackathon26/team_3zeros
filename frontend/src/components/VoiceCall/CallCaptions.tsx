"use client";

import React, { useEffect, useRef } from "react";
import { Stethoscope, User } from "lucide-react";
import type { Locale } from "../../i18n/config";
import "../../i18n/call";
import { t } from "../../i18n/format";
import type { TriageCaptionEvent, VoiceSessionState } from "../../voice/types";
import { cn } from "../../lib/cn";

/**
 * Interactive doctor-style live dialogue stream for the voice call room.
 * Shows full scrollable conversation history with the latest question highlighted cleanly
 * and bilingual machine-translated captions directly beneath each utterance.
 */
export function CallCaptions({
  turns,
  language,
  phase,
}: {
  turns: TriageCaptionEvent[];
  language: Locale;
  phase?: VoiceSessionState;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [turns.length, phase]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t(language, "call.captions")}
      className="flex min-h-48 max-h-[340px] w-full flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4 sm:px-6 lg:max-h-[460px]"
    >
      {turns.length === 0 ? (
        <div className="my-auto flex flex-col items-center gap-2 py-8 text-center">
          <p className="m-0 text-body font-medium text-ink-muted">
            {t(language, "triage.defaultPrompt")}
          </p>
        </div>
      ) : (
        turns.map((c, idx) => {
          const isAssistant = c.role === "assistant";
          const isLatestAssistant = isAssistant && idx === turns.length - 1;
          return (
            <div
              key={`${c.at}-${c.role}-${idx}`}
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
                  "flex max-w-[85%] flex-col gap-1.5 rounded-[20px] px-4 py-3",
                  isAssistant
                    ? isLatestAssistant
                      ? "border border-indigo/25 bg-paper text-ink"
                      : "bg-sunken/75 text-ink"
                    : "bg-indigo-wash text-ink",
                )}
              >
                <span className="text-caption font-semibold text-ink-muted">
                  {isAssistant ? t(language, "triage.careGuide") : t(language, "triage.you")}
                </span>
                <p
                  lang={c.lang}
                  className={cn(
                    "m-0 text-balance leading-relaxed",
                    isLatestAssistant
                      ? "text-heading font-semibold text-ink"
                      : "text-body text-ink",
                  )}
                >
                  {c.text}
                </p>
                {c.translation && (
                  <p
                    lang={c.translation.lang}
                    className="m-0 border-t border-line/70 pt-1.5 text-dense text-ink-muted"
                  >
                    {c.translation.text}
                    <span className="ms-2 inline-block rounded-pill border border-line bg-surface px-2 py-0.5 text-caption">
                      {t(language, "call.translated")}
                    </span>
                  </p>
                )}
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

      {phase === "thinking" && (
        <div className="flex items-end gap-2.5 justify-start">
          <span
            aria-hidden="true"
            className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-pill bg-indigo-wash text-indigo"
          >
            <Stethoscope className="size-4" />
          </span>
          <div className="inline-flex items-center gap-1.5 rounded-[20px] bg-sunken/80 px-4 py-3">
            <span className="size-2 rounded-pill bg-indigo/60 animate-pulse" />
            <span className="size-2 rounded-pill bg-indigo/60 animate-pulse [animation-delay:150ms]" />
            <span className="size-2 rounded-pill bg-indigo/60 animate-pulse [animation-delay:300ms]" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
