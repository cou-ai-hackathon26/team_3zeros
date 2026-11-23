"use client";

import React, { useEffect, useState } from "react";
import { Check, Diamond, Circle, OctagonX } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { cn } from "../../lib/cn";
import {
  computeHandoverView,
  shouldAnimateRouteAdvance,
  type RouteEntity,
  type RouteStop,
} from "../../state/routes";

export interface HandoverTrackerProps {
  entity: RouteEntity;
  currentState: string;
  /** Used only to remember the last state this user saw (advance animation, Phase 8). */
  objectId: string;
  locale: Locale;
  /** Patient view is vertical with a serif holder line; clinical view is horizontal and compact. */
  variant?: "patient" | "clinical";
  /** Name of the practitioner or facility who holds the case now, when known. */
  holderName?: string;
}

function StopShape({ status }: { status: RouteStop["status"] }) {
  const common = { "aria-hidden": true, className: "size-4 shrink-0" } as const;
  if (status === "completed") return <Check {...common} strokeWidth={3} />;
  if (status === "current") return <Diamond {...common} fill="currentColor" />;
  return <Circle {...common} />;
}

/**
 * DESIGN_SYSTEM §6.1. Shows a real case grouped by who holds it. Stops, aliases
 * and exception branches come from src/state/routes.ts; this component never
 * lists states itself. Status is carried by shape and word, never colour alone.
 * Use only where a case exists.
 */
export function HandoverTracker({
  entity,
  currentState,
  objectId,
  locale,
  variant = "patient",
  holderName,
}: HandoverTrackerProps) {
  const view = computeHandoverView(entity, currentState);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    setAdvanced(shouldAnimateRouteAdvance(objectId, currentState));
  }, [objectId, currentState]);

  const holderLine =
    holderName && (view.holder === "practitioner" || view.holder === "sender" || view.holder === "receiver")
      ? t(locale, "holder.named").replace("{name}", holderName)
      : t(locale, `holder.${view.holder}`);
  const patient = variant === "patient";
  const exception = view.exceptionBranch;

  return (
    <section
      aria-label={holderLine}
      data-advanced={advanced ? "true" : "false"}
      className="font-sans text-ink"
    >
      <p
        className={cn(
          "m-0 mb-3",
          patient ? "font-serif text-title" : "text-subheading font-semibold",
          exception?.tone === "emergency" && "text-signal",
        )}
      >
        {holderLine}
      </p>

      <ol
        aria-label={t(locale, "tracker.label")}
        className={cn(
          "m-0 flex list-none gap-0 p-0",
          patient ? "flex-col" : "flex-row flex-wrap items-stretch",
        )}
      >
        {view.segments.map((segment, i) => (
          <li
            key={`${segment.holder}-${i}`}
            aria-current={segment.current ? "step" : undefined}
            className={cn(
              "border-line px-3 py-2",
              patient ? "border-s-4" : "border-t-4",
              segment.current
                ? "border-indigo bg-indigo-wash"
                : segment.stops.every((s) => s.status === "completed")
                  ? "border-indigo bg-surface"
                  : "border-line bg-sunken text-ink-muted",
            )}
          >
            <p className="m-0 text-caption text-ink-muted">
              {t(locale, `holderName.${segment.holder}`)}
              {segment.current && (
                <span className="ms-2 font-semibold text-indigo">{t(locale, "tracker.now")}</span>
              )}
            </p>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {segment.stops.map((stop) => (
                <li
                  key={stop.state}
                  aria-current={stop.status === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 text-dense",
                    stop.status === "current" && "font-semibold",
                  )}
                >
                  <StopShape status={stop.status} />
                  <span>{t(locale, stop.labelKey)}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      {exception && (
        <p
          role="status"
          className={cn(
            "m-0 mt-2 flex items-center gap-2 border-s-4 px-3 py-2 text-dense font-semibold",
            exception.tone === "emergency"
              ? "border-signal bg-signal-wash text-signal"
              : "border-ink-muted bg-sunken text-ink",
          )}
        >
          <OctagonX aria-hidden className="size-4 shrink-0" />
          <span>{t(locale, exception.labelKey)}</span>
        </p>
      )}
    </section>
  );
}
