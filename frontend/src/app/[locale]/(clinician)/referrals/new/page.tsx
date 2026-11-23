"use client";

import React, { useState } from "react";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import { Toast } from "@/components/Toast/Toast";
import styles from "@/app/[locale]/screens.module.css";

export default function NewReferralDraftPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [reason, setReason] = useState("Persistent fever for 3 days with hemoglobin 10.2 g/dL requiring internal medicine evaluation.");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "emergency">("urgent");
  const [receivingFacility, setReceivingFacility] = useState("Tangail 250-Bed District Hospital");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.sectionHeading}>
            {locale === "bn" ? "নতুন রেফারেল খসড়া তৈরি করুন" : "Create referral draft"}
          </h1>
          <p className={styles.capacityMeta}>
            Patient: Karim Uddin (করিম উদ্দিন), Age 54 — Sending: Mirzapur Upazila Health Complex
          </p>
        </div>
        <a href={`/${locale}/referrals/ref-0104`} className={styles.filterChip}>
          Open existing draft REF-2026-0104 ›
        </a>
      </header>

      <form
        className={styles.formStack}
        onSubmit={(e) => {
          e.preventDefault();
          setToastMsg("Referral draft saved. Ready to generate summary or ask patient to share.");
        }}
      >
        <div className={styles.fieldGroup}>
          <label htmlFor="ref-destination" className={styles.fieldLabel}>
            {locale === "bn" ? "গ্রহণকারী হাসপাতাল" : "Receiving facility"}
          </label>
          <select
            id="ref-destination"
            value={receivingFacility}
            onChange={(e) => setReceivingFacility(e.target.value)}
            className={styles.textField}
          >
            <option value="Tangail 250-Bed District Hospital">
              Tangail 250-Bed District Hospital (Reported 3 days ago: 6 Medicine beds)
            </option>
            <option value="Dhaka Medical College Hospital">
              Dhaka Medical College Hospital (Reported 1 day ago: Specialist referral open)
            </option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="ref-urgency" className={styles.fieldLabel}>
            {locale === "bn" ? "জরুরি মাত্রা" : "Urgency"}
          </label>
          <select
            id="ref-urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as "routine" | "urgent" | "emergency")}
            className={styles.textField}
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="ref-reason" className={styles.fieldLabel}>
            {locale === "bn" ? "রেফারেলের ক্লিনিক্যাল কারণ" : "Reason for referral"}
          </label>
          <input
            id="ref-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={styles.textField}
            required
          />
        </div>

        <div className={styles.topBar}>
          <button type="submit" className={styles.primaryCta}>
            {locale === "bn" ? "খসড়া সংরক্ষণ করুন" : "Save referral draft"}
          </button>
          <a href={`/${locale}/referrals/ref-0104`} className={styles.secondaryCta}>
            {locale === "bn" ? "রেফারেল ওয়ার্কস্পেসে যান" : "Continue to referral workspace"}
          </a>
        </div>
      </form>

      {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
    </main>
  );
}
