"use client";

import React, { useState } from "react";
import { RouteLine } from "@/components/RouteLine/RouteLine";
import { DraftBlock } from "@/components/DraftBlock/DraftBlock";
import { ActionBar } from "@/components/ActionBar/ActionBar";
import { SyncBadge } from "@/components/SyncBadge/SyncBadge";
import { StatusLabel } from "@/components/StatusLabel/StatusLabel";
import { Toast } from "@/components/Toast/Toast";
import { t } from "@/i18n/format";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

/**
 * UIUX §6.10 & §6.11: Referral workspace (sender & receiver).
 * RouteLine across the top, DraftBlocks with SourceChips, consent status,
 * SyncBadge, and ActionBar rendering strictly allowed_actions.
 */
export default function ReferralDetailWorkspacePage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [state, setState] = useState("READY_FOR_SENDER_APPROVAL");
  const [allowedActions, setAllowedActions] = useState<string[]>([
    "reopen_draft",
    "approve",
  ]);
  const [summaryText, setSummaryText] = useState(
    "Persistent high fever for 3 days (101.2 °F) with verified hemoglobin 10.2 g/dL and WBC 11,400 /µL."
  );
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const isApprovedOrLater =
    state !== "DRAFT" &&
    state !== "AWAITING_PATIENT_CONSENT" &&
    state !== "READY_FOR_SENDER_APPROVAL";

  return (
    <main className={styles.wideShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.sectionHeading}>
            Referral REF-2026-0104 — Karim Uddin (করিম উদ্দিন)
          </h1>
          <p className={styles.capacityMeta}>
            Mirzapur Upazila Health Complex → Tangail 250-Bed District Hospital (Urgency: Urgent)
          </p>
        </div>
        <div className={styles.chipRow}>
          <StatusLabel entity="referral" state={state} locale={locale} />
          <SyncBadge
            fhirSyncStatus={state === "SENT" || state === "CLOSED" ? "SYNCED" : "NOT_REQUIRED"}
            allowedActions={allowedActions}
            locale={locale}
          />
        </div>
      </header>

      <section className={styles.routePanel}>
        <RouteLine
          entity="referral"
          currentState={state}
          objectId="ref-0104"
          variant="clinician"
          locale={locale}
        />
      </section>

      <DraftBlock
        title={
          locale === "bn"
            ? "ক্লিনিক্যাল সারাংশ ও পরীক্ষার ফলাফল"
            : "Clinical summary & verified findings"
        }
        content={summaryText}
        verified={isApprovedOrLater}
        editable={state === "DRAFT"}
        onChange={setSummaryText}
        sources={[
          { id: "document:cbc-2026#page=1", label: "CBC Lab Report p.1 (Hb 10.2 g/dL)" },
          { id: "fhir:Observation/obs-102", label: "Outpatient Vitals 22 Nov (101.2 °F)" },
        ]}
        locale={locale}
        onOpenSource={(srcId) => setSelectedSource(srcId)}
      />

      {selectedSource && (
        <aside className={styles.guideNotice}>
          <strong>Verified source record:</strong> {selectedSource} — Tangail Diagnostic Center / Mirzapur UHC Encounter Record.
        </aside>
      )}

      <section className={styles.formStack}>
        <div className={styles.topBar}>
          <div>
            <strong>
              {locale === "bn" ? "রোগীর তথ্য শেয়ারের সম্মতি:" : "Patient sharing consent:"}
            </strong>{" "}
            <span>
              {locale === "bn"
                ? "সক্রিয় (টাঙ্গাইল জেলা হাসপাতালের জন্য অনুমোদিত)"
                : "Active (Granted for Tangail District Hospital, matches content hash)"}
            </span>
          </div>
          <a href={`/${locale}/consents/req-1`} className={styles.filterChip}>
            {locale === "bn" ? "রোগীর সম্মতি স্ক্রিন দেখুন" : "View patient consent record"}
          </a>
        </div>
      </section>

      <ActionBar
        entity="referral"
        allowedActions={allowedActions}
        isPending={false}
        locale={locale}
        onAction={(action) => {
          if (action === "reopen_draft") {
            setState("DRAFT");
            setAllowedActions(["request_consent", "use_existing_consent"]);
          } else if (action === "request_consent") {
            setState("AWAITING_PATIENT_CONSENT");
            setAllowedActions(["reopen_draft"]);
          } else if (action === "use_existing_consent") {
            setState("READY_FOR_SENDER_APPROVAL");
            setAllowedActions(["reopen_draft", "approve"]);
          } else if (action === "approve") {
            setState("APPROVED_BY_SENDER");
            setAllowedActions(["reopen_draft", "send"]);
          } else if (action === "send") {
            setState("SENT");
            setAllowedActions(["acknowledge", "decline"]);
          } else if (action === "acknowledge") {
            setState("ACKNOWLEDGED_BY_RECEIVER");
            setAllowedActions(["start"]);
          } else if (action === "start") {
            setState("IN_PROGRESS");
            setAllowedActions(["record_outcome"]);
          } else if (action === "record_outcome") {
            setState("OUTCOME_RETURNED");
            setAllowedActions(["close"]);
          } else if (action === "close") {
            setState("CLOSED");
            setAllowedActions([]);
          } else if (action === "decline") {
            setState("DECLINED");
            setAllowedActions([]);
          }
          setToastMsg(t(locale, `toast.referral.${action}`));
        }}
      />

      {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
    </main>
  );
}
