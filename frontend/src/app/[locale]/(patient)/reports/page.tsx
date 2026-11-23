"use client";

import React, { useState } from "react";
import { StatusLabel } from "../../../../components/StatusLabel/StatusLabel";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

const SAMPLE_REPORTS = [
  {
    id: "doc-1",
    titleBn: "সিবিসি ও হিমোগ্লোবিন প্যানেল রিপোর্ট",
    titleEn: "Complete Blood Count (CBC) & Hemoglobin Panel",
    labBn: "টাঙ্গাইল ডায়াগনস্টিক সেন্টার",
    labEn: "Tangail Diagnostic Center",
    dateBn: "২২ নভেম্বর ২০২৬",
    dateEn: "22 Nov 2026",
    state: "VERIFIED",
    summaryBn: "হিমোগ্লোবিন: ১০.২ g/dL, ডব্লিউবিসি: ১১,৪০০ /µL (ডাক্তার কর্তৃক যাচাইকৃত)",
    summaryEn: "Hemoglobin: 10.2 g/dL, WBC: 11,400 /µL (Clinician verified)",
  },
  {
    id: "doc-2",
    titleBn: "রক্তের গ্লুকোজ ও এইচবিএ১সি রিপোর্ট",
    titleEn: "Fasting Blood Glucose & HbA1c Report",
    labBn: "মির্জাপুর উপজেলা স্বাস্থ্য কমপ্লেক্স ল্যাব",
    labEn: "Mirzapur UHC Laboratory",
    dateBn: "১৪ সেপ্টেম্বর ২০২৬",
    dateEn: "14 Sep 2026",
    state: "VERIFIED",
    summaryBn: "ফাস্টিং গ্লুকোজ: ৬.১ mmol/L (স্বাভাবিক সীমা)",
    summaryEn: "Fasting Glucose: 6.1 mmol/L (Verified reference)",
  },
];

/**
 * MASTERPLAN §8.2 (Q-11):
 * Patient report upload UI is gated behind FEATURE_PATIENT_REPORT_UPLOAD until Q-11 is decided.
 */
export default function PatientReportsPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const canPatientUpload = process.env.NEXT_PUBLIC_FEATURE_PATIENT_REPORT_UPLOAD === "true";

  return (
    <main className={styles.pageShell}>
      <header>
        <h1 className={styles.patientTitle}>
          {locale === "bn" ? "আমার ল্যাব রিপোর্ট ও নথিপত্র" : "My lab reports & documents"}
        </h1>
        <p className={styles.capacityMeta}>
          {locale === "bn"
            ? "ডাক্তার কর্তৃক যাচাইকৃত আপনার সকল পরীক্ষার ফলাফল এবং মূল রিপোর্ট"
            : "Your clinician-verified laboratory results and uploaded medical documents"}
        </p>
      </header>

      <ul className={styles.plainList}>
        {SAMPLE_REPORTS.map((rep) => (
          <li key={rep.id} className={styles.plainListRow}>
            <div className={styles.topBar}>
              <div>
                <div className={styles.doctorTitle}>
                  {locale === "bn" ? rep.titleBn : rep.titleEn}
                </div>
                <p className={styles.capacityMeta}>
                  {locale === "bn"
                    ? `${rep.dateBn} — ${rep.labBn}`
                    : `${rep.dateEn} — ${rep.labEn}`}
                </p>
              </div>
              <StatusLabel
                entity="document"
                state={rep.state}
                stopStatus="completed"
                locale={locale}
              />
            </div>

            <div>{locale === "bn" ? rep.summaryBn : rep.summaryEn}</div>

            <div className={styles.chipRow}>
              <button
                type="button"
                className={styles.filterChip}
                onClick={() =>
                  setSelectedReportId((prev) => (prev === rep.id ? null : rep.id))
                }
              >
                {locale === "bn" ? "বিস্তারিত ফলাফল দেখুন" : "View extracted values"}
              </button>
              <a
                href={`/${locale}/patients/pat-1/reports/${rep.id}/verify`}
                className={styles.filterChip}
              >
                {locale === "bn"
                  ? "ডাক্তারের ওসিআর যাচাই ভিউ দেখুন ›"
                  : "Open clinician OCR verification view ›"}
              </a>
            </div>

            {selectedReportId === rep.id && (
              <div className={styles.guideNotice}>
                {locale === "bn"
                  ? "মূল ফাইল (SHA-256 সংরক্ষিত): হিমোগ্লোবিন ১০.২ g/dL (পূর্ববর্তী ফলাফল: ১১.৪ g/dL, ১৪ সেপ্টেম্বর ২০২৬)।"
                  : "Immutable original file (SHA-256 verified): Hemoglobin 10.2 g/dL (Prior result: 11.4 g/dL on 14 Sep 2026)."}
              </div>
            )}
          </li>
        ))}
      </ul>

      {canPatientUpload ? (
        <form className={styles.formStack}>
          <label htmlFor="report-upload" className={styles.fieldLabel}>
            {locale === "bn" ? "নতুন রিপোর্ট আপলোড করুন" : "Upload new report"}
          </label>
          <input id="report-upload" type="file" accept=".pdf,image/*" />
        </form>
      ) : (
        <p className={styles.guideNotice}>
          {locale === "bn"
            ? "পাইলট পর্যায়ে আপনার ডাক্তার বা হাসপাতাল কর্মী আপনার ল্যাব রিপোর্ট আপলোড ও যাচাই করবেন (Q-11)।"
            : "During the pilot, reports are uploaded and verified by your clinician or facility staff (Q-11)."}
        </p>
      )}
    </main>
  );
}
