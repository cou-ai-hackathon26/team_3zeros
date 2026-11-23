import React from "react";
import type { Locale } from "../i18n/config";
import { formatDhakaDateTime } from "../i18n/format";
import type { EmergencyVitalItem } from "./queue";
import styles from "./EmergencySlip.module.css";

export interface EmergencySlipProps {
  referenceCode: string;
  isProvisional: boolean;
  identityText: string;
  reason: string;
  urgency: "emergency" | "urgent";
  vitals: EmergencyVitalItem[];
  vitalsRecordedAt: string;
  treatmentGiven: string;
  sendingFacility: string;
  receivingFacility: string;
  createdAt: string;
  locale: Locale;
}

/**
 * UIUX §6.13 & FRONTEND §9.3 (Q-09):
 * A6 or A5 portrait printable emergency transfer slip, black only.
 * Shows reference code in large type, patient identity, reason, urgency,
 * vitals with times, treatment given, sending facility and time, receiving facility.
 * No QR code unless Q-09 approves it.
 */
export function EmergencySlip({
  referenceCode,
  isProvisional,
  identityText,
  reason,
  urgency,
  vitals,
  vitalsRecordedAt,
  treatmentGiven,
  sendingFacility,
  receivingFacility,
  createdAt,
  locale,
}: EmergencySlipProps) {
  return (
    <article className={styles.slip} aria-label="Emergency referral transfer slip">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.platformTitle}>Medi Waypoint — Emergency Transfer Slip</span>
          <span className={styles.codeType}>
            {isProvisional
              ? locale === "bn"
                ? "সাময়িক অফলাইন কোড (Q-09)"
                : "Provisional offline code (Q-09)"
              : locale === "bn"
                ? "রেফারেন্স কোড"
                : "Reference code"}
          </span>
        </div>
        <div className={styles.referenceCode}>{referenceCode}</div>
      </header>

      <dl className={styles.grid}>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "রোগীর পরিচয়" : "Patient identity"}</dt>
          <dd>{identityText}</dd>
        </div>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "জরুরি মাত্রা" : "Urgency"}</dt>
          <dd className={styles.urgencyValue}>{urgency.toUpperCase()}</dd>
        </div>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "রেফারেলের কারণ" : "Reason for transfer"}</dt>
          <dd>{reason}</dd>
        </div>
        <div className={styles.field}>
          <dt>
            {locale === "bn" ? "ভাইটালস" : "Vitals"} ({formatDhakaDateTime(vitalsRecordedAt, locale, { forceLatin: true })})
          </dt>
          <dd>
            {vitals.length === 0
              ? "—"
              : vitals.map((v) => `${v.code}: ${v.value} ${v.unit}`).join(", ")}
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "প্রদত্ত চিকিৎসা" : "Treatment given"}</dt>
          <dd>{treatmentGiven || "—"}</dd>
        </div>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "প্রেরক হাসপাতাল ও সময়" : "Sending facility & time"}</dt>
          <dd>
            {sendingFacility} — {formatDhakaDateTime(createdAt, locale, { forceLatin: true })}
          </dd>
        </div>
        <div className={styles.field}>
          <dt>{locale === "bn" ? "গ্রহণকারী হাসপাতাল" : "Receiving facility"}</dt>
          <dd>{receivingFacility}</dd>
        </div>
      </dl>
    </article>
  );
}
