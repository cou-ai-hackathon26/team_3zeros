"use client";

import React from "react";
import { Printer } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime, t } from "../../i18n/format";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { QrCodeSvg, buildReferralQrToken } from "./QrCodeSvg";

export interface ReferralSlipProps {
  referenceCode: string;
  isProvisional: boolean;
  patientSystemId?: string | null;
  patientName?: string | null;
  sendingFacility: string;
  receivingFacility: string;
  urgency: "routine" | "urgent" | "emergency";
  reason: string;
  createdAt: string;
  locale: Locale;
  showPrintButton?: boolean;
}

/**
 * Phase 3D Part 6: Printable A6/A5 portrait Standard Referral Slip for phone-less patients.
 * - Clearly distinguishes provisional offline code vs. server-confirmed reference code.
 * - Displays patient MWP-* system ID (or explicit pending-sync label when patient is offline).
 * - Embeds a zero-PII QR code encoding ONLY `MW-REF:<referenceCode>`.
 */
export function ReferralSlip({
  referenceCode,
  isProvisional,
  patientSystemId,
  patientName,
  sendingFacility,
  receivingFacility,
  urgency,
  reason,
  createdAt,
  locale,
  showPrintButton = true,
}: ReferralSlipProps) {
  const L = (k: string) => t(locale, `chw.slip.${k}`);
  const qrToken = buildReferralQrToken(referenceCode);

  return (
    <div className="flex flex-col gap-3">
      <article
        data-testid="standard-referral-slip"
        aria-label={L("title")}
        className="max-w-[540px] border-2 border-ink bg-paper p-6 text-ink"
      >
        <header className="flex flex-col gap-2 border-b-2 border-ink pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-dense">
            <span className="font-semibold text-ink">{L("title")}</span>
            <span
              data-testid="slip-reference-status"
              className={cn(
                "rounded-control border px-2 py-0.5 text-caption font-bold uppercase tracking-wide",
                isProvisional
                  ? "border-ochre bg-ochre-wash text-ochre"
                  : "border-ink bg-surface text-ink"
              )}
            >
              {isProvisional ? L("provisionalBadge") : L("confirmedBadge")}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
                {L("referenceCode")}
              </span>
              <div className="font-mono text-2xl font-bold tracking-wider tabular-nums text-ink">
                {referenceCode}
              </div>
              <span className="font-mono text-caption text-ink-muted">{qrToken}</span>
            </div>
            <QrCodeSvg referenceCode={referenceCode} sizePx={112} label={L("referenceCode")} />
          </div>
          <p className="m-0 text-caption text-ink-muted">{L("qrCaption")}</p>
        </header>

        <dl className="m-0 mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("patientSystemId")}
            </dt>
            <dd className="m-0 font-mono text-body font-bold text-ink">
              {patientSystemId || L("patientIdPending")}
            </dd>
          </div>
          {patientName && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
                {L("patientName")}
              </dt>
              <dd className="m-0 text-body font-medium text-ink">{patientName}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("urgency")}
            </dt>
            <dd className="m-0 text-body font-bold uppercase text-ink">
              {t(locale, `referrals.${urgency}`)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("reason")}
            </dt>
            <dd className="m-0 text-body font-medium text-ink">{reason}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("sendingFacility")}
            </dt>
            <dd className="m-0 text-body font-medium text-ink">{sendingFacility}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("receivingFacility")}
            </dt>
            <dd className="m-0 text-body font-medium text-ink">{receivingFacility}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold uppercase tracking-wider text-ink-muted">
              {L("createdAt")}
            </dt>
            <dd className="m-0 text-body font-medium text-ink">
              {formatDhakaDateTime(createdAt, locale, { forceLatin: true })}
            </dd>
          </div>
        </dl>
      </article>

      {showPrintButton && (
        <div className="print:hidden">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
          >
            <Printer aria-hidden className="mr-2 size-4" />
            {L("print")}
          </Button>
        </div>
      )}
    </div>
  );
}
