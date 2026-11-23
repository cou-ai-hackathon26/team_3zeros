import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import type { StopStatus } from "../../state/routes";
import styles from "./StatusLabel.module.css";

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
    <span className={`${styles.badge} ${styles[stopStatus]}`}>
      <span className={styles.shape} aria-hidden="true">
        {shape}
      </span>
      <span className={styles.text}>{t(locale, `state.${entity}.${state}`)}</span>
    </span>
  );
}
