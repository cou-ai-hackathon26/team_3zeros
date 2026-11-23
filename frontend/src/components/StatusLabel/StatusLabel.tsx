"use client";

import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import type { StopStatus } from "../../state/routes";
import { cn } from "../../lib/cn";

export interface StatusLabelProps {
  entity: "appointment" | "referral" | "triage_session" | "document" | "consent_request" | "consent";
  state: string;
  stopStatus?: StopStatus | "exception" | "emergency";
  locale: Locale;
}

/**
 * UIUX §3.2 & §5:
 * Status is never shown by color alone. Each status has a text label and a route-stop shape.
 */
export function StatusLabel({
  entity,
  state,
  stopStatus = "current",
  locale,
}: StatusLabelProps) {
  const shape =
    stopStatus === "completed"
      ? "●"
      : stopStatus === "current"
        ? "◉"
        : stopStatus === "exception" || stopStatus === "emergency"
          ? "▪"
          : "○";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-medium",
        stopStatus === "completed" && "border-paddy bg-paddy-wash/30 text-paddy",
        stopStatus === "current" && "border-indigo bg-indigo-wash text-indigo",
        (stopStatus === "exception" || stopStatus === "emergency") && "border-signal bg-signal-wash/30 text-signal",
        stopStatus === "upcoming" && "border-line bg-surface text-ink-muted"
      )}
    >
      <span aria-hidden="true">{shape}</span>
      <span>{t(locale, `state.${entity}.${state}`)}</span>
    </span>
  );
}
