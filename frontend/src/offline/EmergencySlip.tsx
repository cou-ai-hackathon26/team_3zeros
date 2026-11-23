"use client";

import React from "react";
import type { Locale } from "../i18n/config";
import { formatDhakaDateTime } from "../i18n/format";
import type { EmergencyVitalItem } from "./queue";

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
    <article className="max-w-[520px] border-2 border-ink bg-paper p-6 text-ink" aria-label="Emergency referral transfer slip">
      <header className="flex flex-col gap-2 border-b-2 border-ink pb-4">
        <div className="flex items-baseline justify-between text-dense">
          <span className="font-semibold text-ink">Medi Waypoint — Emergency Transfer Slip</span>
          <span className="text-ink-muted">
            {isProvisional
              ? locale === "bn"
                ? "সাময়িক অফলাইন কোড (Q-09)"
                : "Provisional offline code (Q-09)"
              : locale === "bn"
                ? "রেফারেন্স কোড"
                : "Reference code"}
          </span>
        </div>
        <div className="font-mono text-2xl font-bold tracking-wider tabular-nums text-ink">{referenceCode}</div>
      </header>

      <dl className="m-0 mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "রোগীর পরিচয়" : "Patient identity"}</dt>
          <dd className="m-0 text-body font-medium text-ink">{identityText}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "জরুরি মাত্রা" : "Urgency"}</dt>
          <dd className="m-0 text-body font-bold uppercase text-ink">{urgency.toUpperCase()}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "রেফারেলের কারণ" : "Reason for transfer"}</dt>
          <dd className="m-0 text-body font-medium text-ink">{reason}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
            {locale === "bn" ? "ভাইটালস" : "Vitals"} ({formatDhakaDateTime(vitalsRecordedAt, locale, { forceLatin: true })})
          </dt>
          <dd className="m-0 text-body font-medium text-ink">
            {vitals.length === 0
              ? "—"
              : vitals.map((v) => `${v.code}: ${v.value} ${v.unit}`).join(", ")}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "প্রদত্ত চিকিৎসা" : "Treatment given"}</dt>
          <dd className="m-0 text-body font-medium text-ink">{treatmentGiven || "—"}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "প্রেরক হাসপাতাল ও সময়" : "Sending facility & time"}</dt>
          <dd className="m-0 text-body font-medium text-ink">
            {sendingFacility} — {formatDhakaDateTime(createdAt, locale, { forceLatin: true })}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">{locale === "bn" ? "গ্রহণকারী হাসপাতাল" : "Receiving facility"}</dt>
          <dd className="m-0 text-body font-medium text-ink">{receivingFacility}</dd>
        </div>
      </dl>
    </article>
  );
}
