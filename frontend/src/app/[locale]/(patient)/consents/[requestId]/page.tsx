"use client";

import React, { useState } from "react";
import { ConsentSheet } from "@/components/ConsentSheet/ConsentSheet";
import { StatusLabel } from "@/components/StatusLabel/StatusLabel";
import { Toast } from "@/components/Toast/Toast";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

/**
 * UIUX §6.7: Consent request (patient).
 */
export default function PatientConsentRequestPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const [consentState, setConsentState] = useState<"PENDING" | "GRANTED" | "REFUSED">("PENDING");
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.patientTitle}>
            {locale === "bn"
              ? "তথ্য শেয়ারের অনুমতি ও গোপনীয়তা"
              : "Record sharing & privacy consent"}
          </h1>
          <p className={styles.capacityMeta}>
            {locale === "bn"
              ? "আপনার অনুমতি ছাড়া কোনো হাসপাতাল বা ডাক্তারের কাছে আপনার পূর্ববর্তী রেকর্ড পাঠানো হয় না (INV-10)।"
              : "Your clinical record is never shared with another facility without your explicit permission (INV-10)."}
          </p>
        </div>
        <StatusLabel
          entity="consent_request"
          state={consentState}
          stopStatus={consentState === "GRANTED" ? "completed" : consentState === "REFUSED" ? "exception" : "current"}
          locale={locale}
        />
      </header>

      <ConsentSheet
        recipientPractitioner={locale === "bn" ? "ডা. রহিমা খাতুন" : "Dr. Rahima Khatun"}
        recipientFacility={
          locale === "bn"
            ? "টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল"
            : "Tangail 250-Bed District Hospital"
        }
        purpose={
          locale === "bn"
            ? "মির্জাপুর উপজেলা স্বাস্থ্য কমপ্লেক্স থেকে বিশেষজ্ঞ রেফারেল পরামর্শের জন্য"
            : "Specialist referral consultation from Mirzapur Upazila Health Complex"
        }
        categories={
          locale === "bn"
            ? [
                "সাক্ষাতের বিবরণ (২২ নভেম্বর ২০২৬ — বহির্বিভাগ)",
                "ল্যাব রিপোর্ট (সিবিসি ও হিমোগ্লোবিন ১০.২ g/dL)",
                "বর্তমান ওষুধের তালিকা (অ্যামলোডিপিন ৫ মি.গ্রা.)",
              ]
            : [
                "Clinical encounters (22 Nov 2026 — Outpatient visit)",
                "Verified lab reports (CBC & Hemoglobin 10.2 g/dL)",
                "Current medications (Amlodipine 5mg)",
              ]
        }
        expiresAt="2026-12-23T00:00:00Z"
        locale={locale}
        onGrant={() => {
          setConsentState("GRANTED");
          setDecisionMsg(
            locale === "bn"
              ? "ডা. রহিমা খাতুনের সাথে তথ্য শেয়ারের অনুমতি দেওয়া হয়েছে।"
              : "Record sharing granted for Dr. Rahima Khatun."
          );
        }}
        onRefuse={() => {
          setConsentState("REFUSED");
          setDecisionMsg(
            locale === "bn"
              ? "তথ্য শেয়ার করা হয়নি। প্রেরক ডাক্তারকে জানানো হয়েছে।"
              : "Sharing refused. Your sending doctor has been notified."
          );
        }}
      />

      {consentState === "GRANTED" && (
        <section className={styles.formStack}>
          <div className={styles.topBar}>
            <div>
              <h2 className={styles.sectionHeading}>
                {locale === "bn" ? "সক্রিয় সম্মতি" : "Active sharing permission"}
              </h2>
              <p className={styles.capacityMeta}>
                {locale === "bn"
                  ? "আপনি যেকোনো সময় এই অনুমতি প্রত্যাহার করতে পারেন।"
                  : "You can revoke this permission at any time to stop future access."}
              </p>
            </div>
            <button
              type="button"
              className={styles.filterChip}
              onClick={() => {
                setConsentState("REFUSED");
                setDecisionMsg(
                  locale === "bn"
                    ? "তথ্য শেয়ারের অনুমতি প্রত্যাহার করা হয়েছে।"
                    : "Sharing permission revoked."
                );
              }}
            >
              {locale === "bn" ? "অনুমতি প্রত্যাহার করুন" : "Revoke sharing"}
            </button>
          </div>
        </section>
      )}

      {decisionMsg && <Toast message={decisionMsg} onDismiss={() => setDecisionMsg(null)} />}
    </main>
  );
}
