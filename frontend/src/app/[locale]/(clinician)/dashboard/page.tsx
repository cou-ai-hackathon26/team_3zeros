"use client";

import React, { useState } from "react";
import { QueueList, type QueueItem } from "../../../../components/QueueList/QueueList";
import { RouteLine } from "../../../../components/RouteLine/RouteLine";
import { ActionBar } from "../../../../components/ActionBar/ActionBar";
import { Toast } from "../../../../components/Toast/Toast";
import { t } from "../../../../i18n/format";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

const INITIAL_QUEUE: QueueItem[] = [
  {
    id: "appt-1",
    patientName: "Karim Uddin, 54",
    patientNameBn: "করিম উদ্দিন",
    reason: "Fever 3d",
    urgency: "urgent",
    escalated: false,
    createdAt: "2026-11-22T23:30:00Z",
  },
  {
    id: "appt-2",
    patientName: "Nasima Begum, 41",
    patientNameBn: "নাসিমা বেগম",
    reason: "Severe chest pain — unacknowledged transfer",
    urgency: "emergency",
    escalated: true,
    escalatedAt: "2026-11-23T01:10:00Z",
    createdAt: "2026-11-23T00:50:00Z",
  },
];

/**
 * UIUX §6.8: Clinician workspace (desktop, three panes: Queue | Detail | Patient context).
 * Counts appear as plain numbers in the queue tabs, never as a grid of stat cards (§3.6).
 */
export default function ClinicianDashboardPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [queueItems, setQueueItems] = useState<QueueItem[]>(INITIAL_QUEUE);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_QUEUE[0].id);
  const [activeTab, setActiveTab] = useState<"needs_you" | "incoming" | "verify" | "outgoing">("needs_you");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const selectedItem = queueItems.find((i) => i.id === selectedId) ?? queueItems[0] ?? null;

  return (
    <main className={styles.clinicianWorkspace}>
      <aside className={styles.workspacePane} aria-label="Queue navigation">
        <div className={styles.queueTabs}>
          <button
            type="button"
            className={`${styles.queueTab} ${activeTab === "needs_you" ? styles.queueTabActive : ""}`}
            onClick={() => setActiveTab("needs_you")}
          >
            <span>{t(locale, "clinician.needsYou")}</span>
            <span className={styles.numeralCell}>({queueItems.length})</span>
          </button>
          <button
            type="button"
            className={`${styles.queueTab} ${activeTab === "incoming" ? styles.queueTabActive : ""}`}
            onClick={() => setActiveTab("incoming")}
          >
            <span>{t(locale, "clinician.incomingReferrals")}</span>
            <span className={styles.numeralCell}>(2)</span>
          </button>
          <button
            type="button"
            className={`${styles.queueTab} ${activeTab === "verify" ? styles.queueTabActive : ""}`}
            onClick={() => setActiveTab("verify")}
          >
            <span>{t(locale, "clinician.verifyReports")}</span>
            <span className={styles.numeralCell}>(4)</span>
          </button>
          <button
            type="button"
            className={`${styles.queueTab} ${activeTab === "outgoing" ? styles.queueTabActive : ""}`}
            onClick={() => setActiveTab("outgoing")}
          >
            <span>{t(locale, "clinician.outgoingReferrals")}</span>
            <span className={styles.numeralCell}>(1)</span>
          </button>
        </div>

        <QueueList
          items={queueItems}
          selectedId={selectedItem?.id}
          onSelect={setSelectedId}
          locale={locale}
        />
      </aside>

      <section className={styles.workspacePane} aria-label="Decision detail">
        {selectedItem ? (
          <>
            <header className={styles.topBar}>
              <div>
                <h1 className={styles.sectionHeading}>{selectedItem.patientName}</h1>
                <p className={styles.capacityMeta}>Requested Thu 10:30</p>
              </div>
              <div className={styles.chipRow}>
                <a href={`/${locale}/referrals/ref-0104`} className={styles.filterChip}>
                  Open referral workspace
                </a>
                <a href={`/${locale}/referrals/new`} className={styles.filterChip}>
                  Create referral draft
                </a>
              </div>
            </header>

            <RouteLine
              entity="appointment"
              currentState="REQUESTED"
              objectId={selectedItem.id}
              variant="clinician"
              locale={locale}
            />

            <div className={styles.formStack}>
              <h2 className={styles.sectionHeading}>Triage summary</h2>
              <p style={{ margin: 0 }}>
                “{selectedItem.reason} — patient reported evening fever spikes.”
              </p>
            </div>

            <ActionBar
              entity="appointment"
              allowedActions={["decline", "propose_alternate", "accept"]}
              isPending={false}
              locale={locale}
              onAction={(action) => {
                setQueueItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
                setToastMsg(t(locale, `toast.appointment.${action}`));
              }}
            />
          </>
        ) : (
          <p>{t(locale, "clinician.emptyQueue")}</p>
        )}

        {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
      </section>

      <aside className={styles.workspacePane} aria-label="Patient context">
        <div className={styles.topBar}>
          <h2 className={styles.sectionHeading}>Patient context</h2>
          <a href={`/${locale}/patients/pat-1`} className={styles.filterChip}>
            Full chart
          </a>
        </div>
        <ul className={styles.plainList}>
          <li className={styles.plainListRow}>
            <strong>Allergies:</strong> Penicillin
          </li>
          <li className={styles.plainListRow}>
            <strong>Medicines:</strong> Amlodipine 5mg
          </li>
          <li className={styles.plainListRow}>
            <strong>Last visits:</strong> 14 Sep 2026 — Outpatient Medicine
          </li>
          <li className={styles.plainListRow}>
            <strong>Reports:</strong>{" "}
            <a href={`/${locale}/patients/pat-1/reports/doc-1/verify`}>
              CBC Report (Draft ready to check)
            </a>
          </li>
          <li className={styles.plainListRow}>
            <strong>Emergency transfer:</strong>{" "}
            <a href={`/${locale}/emergency`}>
              Open 5-field Emergency Referral Mode
            </a>
          </li>
        </ul>
      </aside>
    </main>
  );
}
