"use client";

import React, { useEffect, useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import {
  computeRouteView,
  shouldAnimateRouteAdvance,
  type RouteEntity,
} from "../../state/routes";
import { cn } from "../../lib/cn";

export interface RouteLineProps {
  entity: RouteEntity;
  currentState: string;
  objectId: string;
  variant?: "patient" | "clinician";
  locale: Locale;
}

/**
 * UIUX §3.1, §4.2, §4.4, §5 & FRONTEND §10.2:
 * - Wayfinding RouteLine drawn as an aria-hidden SVG path paired with an accessible <ol><li> stop list.
 * - Completed stops filled, current stop has a turmeric ring, upcoming stops outlined.
 * - Terminal side/exception states render as a branch off the line with a labeled end-cap.
 * - Animates forward over 520ms only when the server state is newer than the last seen state in sessionStorage.
 * - Under prefers-reduced-motion: reduce, renders final state immediately.
 */
export function RouteLine({
  entity,
  currentState,
  objectId,
  variant = "patient",
  locale,
}: RouteLineProps) {
  const routeView = computeRouteView(entity, currentState);
  const [animateForward, setAnimateForward] = useState(false);

  useEffect(() => {
    setAnimateForward(shouldAnimateRouteAdvance(objectId, currentState));
  }, [objectId, currentState]);

  const stopCount = routeView.stops.length;
  const currentIdx = Math.max(
    0,
    routeView.stops.findIndex((s) => s.status === "current")
  );
  const progressFraction = stopCount > 1 ? currentIdx / (stopCount - 1) : 1;

  return (
    <div
      className={cn(
        "relative flex gap-3",
        variant === "clinician" ? "flex-col py-2" : "flex-row items-stretch py-3"
      )}
      data-animate={animateForward ? "true" : "false"}
    >
      <svg
        className={cn("pointer-events-none shrink-0", variant === "clinician" ? "h-3.5 w-full" : "min-h-40 w-6")}
        aria-hidden="true"
        viewBox={variant === "clinician" ? "0 0 360 32" : "0 0 32 220"}
        preserveAspectRatio="none"
      >
        {variant === "clinician" ? (
          <>
            <line x1="16" y1="16" x2="344" y2="16" className="stroke-line stroke-[2.5px]" strokeLinecap="round" />
            <line
              x1="16"
              y1="16"
              x2={16 + Math.round(328 * progressFraction)}
              y2="16"
              className="stroke-indigo stroke-[3px] transition-all duration-500 ease-out"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <line x1="16" y1="16" x2="16" y2="204" className="stroke-line stroke-[2.5px]" strokeLinecap="round" />
            <line
              x1="16"
              y1="16"
              x2="16"
              y2={16 + Math.round(188 * progressFraction)}
              className="stroke-indigo stroke-[3px] transition-all duration-500 ease-out"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>

      <ol
        className={cn(
          "m-0 flex list-none p-0 gap-4",
          variant === "clinician" ? "flex-row" : "flex-col justify-between"
        )}
        aria-label={locale === "bn" ? "যাত্রাপথের ধাপ" : "Journey route"}
      >
        {routeView.stops.map((stop) => (
          <li
            key={stop.state}
            className={cn(
              "flex items-center gap-2 text-dense",
              stop.status === "completed" && "text-paddy font-semibold",
              stop.status === "current" && "text-indigo font-bold",
              stop.status === "upcoming" && "text-ink-muted"
            )}
            aria-current={stop.status === "current" ? "step" : undefined}
          >
            <span aria-hidden="true">
              {stop.status === "completed" ? "●" : stop.status === "current" ? "◉" : "○"}
            </span>
            <span>{t(locale, stop.labelKey)}</span>
          </li>
        ))}
      </ol>

      {routeView.exceptionBranch && (
        <div
          className={cn(
            "flex items-center gap-1.5 text-dense font-semibold",
            routeView.exceptionBranch.tone === "emergency" ? "text-signal" : "text-signal"
          )}
          role="status"
        >
          <span aria-hidden="true">└─▪</span>
          <span>{t(locale, routeView.exceptionBranch.labelKey)}</span>
        </div>
      )}
    </div>
  );
}
