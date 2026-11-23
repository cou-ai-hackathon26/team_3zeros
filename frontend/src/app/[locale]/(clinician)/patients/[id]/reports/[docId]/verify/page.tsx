"use client";

import React, { useState } from "react";
import { ReportViewer } from "@/components/ReportViewer/ReportViewer";
import { SyncBadge } from "@/components/SyncBadge/SyncBadge";
import { Toast } from "@/components/Toast/Toast";
import { t } from "@/i18n/format";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

/**
 * UIUX §6.9: Report verification split view.
 */
export default function ReportVerificationPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [syncState, setSyncState] = useState<"NOT_REQUIRED" | "PENDING" | "SYNCED">("NOT_REQUIRED");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  return (
    <main className={styles.wideShell}>
      <header className={styles.topBar}>
        <h1 className={styles.sectionHeading}>
          {locale === "bn" ? "ল্যাব রিপোর্টের শনাক্তকৃত মান যাচাই করুন" : "Verify extracted lab values"}
        </h1>
        <SyncBadge fhirSyncStatus={syncState} locale={locale} />
      </header>

      <ReportViewer
        documentUrl="/api/v1/documents/doc-1/content"
        filename="cbc-panel-2026-11-22.pdf"
        fields={[
          {
            id: "f-hb",
            name: "Hemoglobin",
            value: "10.2",
            unit: "g/dL",
            observedDate: "2026-11-22",
            lab: "Tangail Diagnostic Center",
            confidence: 0.68,
            page: 1,
            bbox: [0.12, 0.25, 0.48, 0.31],
          },
          {
            id: "f-wbc",
            name: "WBC Count",
            value: "11400",
            unit: "/µL",
            observedDate: "2026-11-22",
            lab: "Tangail Diagnostic Center",
            confidence: 0.94,
            page: 1,
            bbox: [0.12, 0.35, 0.48, 0.41],
          },
        ]}
        priorResults={{
          Hemoglobin: [
            { value: "11.4", unit: "g/dL", date: "14 Sep 2026", lab: "Mirzapur UHC Lab" },
          ],
        }}
        locale={locale}
        onVerify={() => {
          setSyncState("SYNCED");
          setToastMsg(t(locale, "toast.document.verify"));
        }}
      />

      {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
    </main>
  );
}
