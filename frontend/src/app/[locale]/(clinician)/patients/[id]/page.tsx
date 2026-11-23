"use client";

import React, { useState } from "react";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import { Toast } from "@/components/Toast/Toast";
import styles from "@/app/[locale]/screens.module.css";

/**
 * FRONTEND §3 & MASTERPLAN INV-13:
 * Authorized patient chart + human duplicate-identity candidate review banner (never merged automatically).
 */
export default function ClinicianPatientChartPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [duplicateResolved, setDuplicateResolved] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.sectionHeading}>
            Karim Uddin (করিম উদ্দিন) — Patient Chart
          </h1>
          <p className={styles.capacityMeta}>
            Age 54, Male — Village: Gorai, Upazila: Mirzapur, District: Tangail
          </p>
        </div>
        <div className={styles.chipRow}>
          <a href={`/${locale}/referrals/new`} className={styles.filterChip}>
            + Create referral
          </a>
          <a
            href={`/${locale}/patients/pat-1/reports/doc-1/verify`}
            className={styles.filterChip}
          >
            Verify lab report (1)
          </a>
        </div>
      </header>

      {!duplicateResolved && (
        <section className={styles.formStack} aria-label="Duplicate identity review">
          <h2 className={styles.sectionHeading}>
            Possible duplicate record requires human review (INV-13)
          </h2>
          <p className={styles.capacityMeta}>
            Another patient record for “Md. Karim Uddin” (estimated age 55, Mirzapur) shares phone suffix. Per INV-13, patient records are never merged automatically.
          </p>
          <div className={styles.chipRow}>
            <button
              type="button"
              className={styles.filterChip}
              onClick={() => {
                setDuplicateResolved("same_person");
                setToastMsg("Marked as same person for identity linking review.");
              }}
            >
              Confirm same person
            </button>
            <button
              type="button"
              className={styles.filterChip}
              onClick={() => {
                setDuplicateResolved("different");
                setToastMsg("Marked as different individuals.");
              }}
            >
              Mark as different person
            </button>
          </div>
        </section>
      )}

      <section className={styles.formStack}>
        <h2 className={styles.sectionHeading}>
          {locale === "bn" ? "সাক্ষাৎ ও ক্লিনিক্যাল পর্যবেক্ষণ" : "Encounters & clinical observations"}
        </h2>
        <ul className={styles.plainList}>
          <li className={styles.plainListRow}>
            <div className={styles.doctorTitle}>
              22 Nov 2026 — Outpatient Visit (Mirzapur Upazila Health Complex)
            </div>
            <div>
              <strong>Vitals:</strong> BP 135/85 mmHg, Temp 101.2 °F, Pulse 94 bpm
            </div>
            <div>
              <strong>Assessment note:</strong> Persistent fever for 3 days with pallor; CBC ordered and specialist referral drafted.
            </div>
          </li>
          <li className={styles.plainListRow}>
            <div className={styles.doctorTitle}>
              14 Sep 2026 — Outpatient Medicine Follow-up
            </div>
            <div>
              <strong>Vitals:</strong> BP 138/88 mmHg — Medication continued: Amlodipine 5mg daily.
            </div>
          </li>
        </ul>
      </section>

      {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
    </main>
  );
}
