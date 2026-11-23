"use client";

import React, { useEffect, useState } from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import {
  computeRouteView,
  shouldAnimateRouteAdvance,
  type RouteEntity,
} from "../../state/routes";
import styles from "./RouteLine.module.css";

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
 * - Animates forward over --motion-route-duration (520ms) only when the server state is newer
 *   than the last seen state in sessionStorage.
 * - Under prefers-reduced-motion: reduce, renders final state immediately with a 2px turmeric outline flash.
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
      className={`${styles.container} ${
        variant === "clinician" ? styles.clinician : styles.patient
      }`}
      data-animate={animateForward ? "true" : "false"}
    >
      <svg
        className={styles.svgLine}
        aria-hidden="true"
        viewBox={variant === "clinician" ? "0 0 360 32" : "0 0 32 220"}
        preserveAspectRatio="none"
      >
        {variant === "clinician" ? (
          <>
            <line
              x1="16"
              y1="16"
              x2="344"
              y2="16"
              className={styles.trackBase}
            />
            <line
              x1="16"
              y1="16"
              x2={16 + Math.round(328 * progressFraction)}
              y2="16"
              className={styles.trackActive}
            />
          </>
        ) : (
          <>
            <line
              x1="16"
              y1="16"
              x2="16"
              y2="204"
              className={styles.trackBase}
            />
            <line
              x1="16"
              y1="16"
              x2="16"
              y2={16 + Math.round(188 * progressFraction)}
              className={styles.trackActive}
            />
          </>
        )}
      </svg>

      <ol
        className={styles.stopList}
        aria-label={locale === "bn" ? "যাত্রাপথের ধাপ" : "Journey route"}
      >
        {routeView.stops.map((stop) => (
          <li
            key={stop.state}
            className={`${styles.stopItem} ${styles[stop.status]} ${
              stop.status === "current" && animateForward ? styles.flashStop : ""
            }`}
            aria-current={stop.status === "current" ? "step" : undefined}
          >
            <span className={styles.stopMarker} aria-hidden="true">
              {stop.status === "completed" ? "●" : stop.status === "current" ? "◉" : "○"}
            </span>
            <span className={styles.stopLabel}>{t(locale, stop.labelKey)}</span>
          </li>
        ))}
      </ol>

      {routeView.exceptionBranch && (
        <div
          className={`${styles.exceptionBranch} ${
            routeView.exceptionBranch.tone === "emergency"
              ? styles.emergencyBranch
              : ""
          }`}
          role="status"
        >
          <span className={styles.branchConnector} aria-hidden="true">
            └─▪
          </span>
          <span className={styles.branchLabel}>
            {t(locale, routeView.exceptionBranch.labelKey)}
          </span>
        </div>
      )}
    </div>
  );
}
