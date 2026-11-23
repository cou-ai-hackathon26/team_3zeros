"use client";

import React, { useState } from "react";
import { EmergencyQueueStore, type DecryptedQueueItem } from "../../../../offline/queue";
import { EmergencySlip } from "../../../../offline/EmergencySlip";
import { SyncBadge } from "../../../../components/SyncBadge/SyncBadge";
import { normalizeDigits } from "../../../../i18n/format";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

const defaultStore = new EmergencyQueueStore();

/**
 * UIUX §6.12 & §6.13, FRONTEND §9 (INV-16):
 * Five-field offline-capable Emergency Referral Mode:
 * 1. Identity or "Identity not confirmed" description
 * 2. Reason for transfer
 * 3. Urgency: "Emergency" (default) or "Urgent"
 * 4. Vitals (numeric keypad)
 * 5. Treatment given
 * Printable immediately after local save via A5/A6 EmergencySlip.
 */
export default function EmergencyReferralPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [identityDescription, setIdentityDescription] = useState(
    "Karim Uddin, 54y (Identity not confirmed)"
  );
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"emergency" | "urgent">("emergency");
  const [bpValue, setBpValue] = useState("160/100");
  const [treatmentGiven, setTreatmentGiven] = useState("");
  const [savedItem, setSavedItem] = useState<DecryptedQueueItem | null>(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [hasStaleBanner, setHasStaleBanner] = useState(false);

  React.useEffect(() => {
    let active = true;
    async function checkAndSync() {
      const stale = await defaultStore.hasStaleItemsOver72Hours();
      if (active) setHasStaleBanner(stale);
    }
    checkAndSync();
    window.addEventListener("online", checkAndSync);
    window.addEventListener("focus", checkAndSync);
    const timer = setInterval(checkAndSync, 30000);
    return () => {
      active = false;
      window.removeEventListener("online", checkAndSync);
      window.removeEventListener("focus", checkAndSync);
      clearInterval(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const item = await defaultStore.enqueue({
      facilityId: "fac-uhc-12",
      facilityShortCode: "UHC12",
      payload: {
        unverified_description: identityDescription,
        reason,
        urgency,
        vitals: {
          recorded_at: new Date().toISOString(),
          items: [{ code: "BP", value: normalizeDigits(bpValue), unit: "mmHg" }],
        },
        treatment_given: treatmentGiven,
      },
    });
    setSavedItem(item);
  }

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.sectionHeading}>
            {locale === "bn"
              ? "জরুরি রেফারেল ট্রান্সফার (অফলাইন সাপোর্টসহ)"
              : "Emergency referral transfer (Offline-capable)"}
          </h1>
          <p className={styles.capacityMeta}>
            {locale === "bn"
              ? "নেটওয়ার্ক না থাকলেও এই ৫টি তথ্য ডিভাইসে এনক্রিপ্ট করে সংরক্ষণ ও তাৎক্ষণিক স্লিপ প্রিন্ট করা যাবে (INV-16)।"
              : "Never blocked by network failure or non-essential fields. Saves encrypted locally and prints slip immediately (INV-16)."}
          </p>
        </div>
        <SyncBadge
          offlineQueueState={savedItem ? savedItem.state : "QUEUED_LOCAL"}
          locale={locale}
        />
      </header>

      {hasStaleBanner && (
        <div role="alert" className={styles.guideNotice}>
          {locale === "bn"
            ? "সতর্কতা: ৭২ ঘণ্টার বেশি সময় ধরে অফলাইন জরুরি রেফারেল সিঙ্ক হয়নি।"
            : "Attention: One or more offline emergency referrals have not synced for over 72 hours."}
        </div>
      )}

      <form className={styles.formStack} onSubmit={handleSubmit}>
        <div className={styles.fieldGroup}>
          <label htmlFor="em-identity" className={styles.fieldLabel}>
            1.{" "}
            {locale === "bn"
              ? "রোগীর পরিচয় অথবা অশনাক্তকৃত বিবরণ"
              : "Patient identity or unconfirmed description"}
          </label>
          <input
            id="em-identity"
            type="text"
            value={identityDescription}
            onChange={(e) => setIdentityDescription(e.target.value)}
            className={styles.textField}
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="em-reason" className={styles.fieldLabel}>
            2. {locale === "bn" ? "রেফারেলের কারণ" : "Reason for transfer"}
          </label>
          <input
            id="em-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              locale === "bn"
                ? "যেমন: একলাম্পসিয়া / প্রসবোত্তর রক্তপাত / স্ট্রোক"
                : "e.g., Eclampsia with seizure / Post-partum hemorrhage / Suspected stroke"
            }
            className={styles.textField}
            required
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="em-urgency" className={styles.fieldLabel}>
            3. {locale === "bn" ? "জরুরি মাত্রা" : "Urgency"}
          </label>
          <select
            id="em-urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as "emergency" | "urgent")}
            className={styles.textField}
          >
            <option value="emergency">Emergency</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="em-vitals-bp" className={styles.fieldLabel}>
            4. {locale === "bn" ? "ভাইটালস (রক্তচাপ mmHg)" : "Vitals (Blood pressure mmHg)"}
          </label>
          <input
            id="em-vitals-bp"
            type="text"
            inputMode="numeric"
            value={bpValue}
            onChange={(e) => setBpValue(normalizeDigits(e.target.value))}
            className={styles.textField}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="em-treatment" className={styles.fieldLabel}>
            5. {locale === "bn" ? "প্রদত্ত প্রাথমিক চিকিৎসা" : "Treatment given"}
          </label>
          <input
            id="em-treatment"
            type="text"
            value={treatmentGiven}
            onChange={(e) => setTreatmentGiven(e.target.value)}
            placeholder={
              locale === "bn"
                ? "যেমন: আইভি স্যালাইন ও ম্যাগনেসিয়াম সালফেট লোডিং ডোজ"
                : "e.g., IV Normal Saline + MgSO4 loading dose"
            }
            className={styles.textField}
          />
        </div>

        <button
          type="button"
          className={styles.secondaryCta}
          onClick={() => setShowMoreDetails((v) => !v)}
        >
          {locale === "bn" ? "আরও তথ্য যোগ করুন (ঐচ্ছিক)" : "Add more details"}
        </button>

        {showMoreDetails && (
          <div className={styles.fieldGroup}>
            <label htmlFor="em-receiving" className={styles.fieldLabel}>
              {locale === "bn" ? "গ্রহণকারী হাসপাতাল" : "Receiving facility"}
            </label>
            <input
              id="em-receiving"
              type="text"
              defaultValue="Tangail 250-Bed District Hospital"
              className={styles.textField}
            />
          </div>
        )}

        <button type="submit" className={styles.emergencySubmitBtn}>
          {locale === "bn"
            ? "জরুরি রেফারেল সংরক্ষণ ও পাঠান"
            : "Save & send emergency referral"}
        </button>
      </form>

      {savedItem && (
        <section className={styles.formStack}>
          <div className={styles.topBar}>
            <h2 className={styles.sectionHeading}>
              {locale === "bn" ? "প্রিন্ট করার জন্য স্লিপ প্রস্তুত" : "Transfer slip ready"}
            </h2>
            <button
              type="button"
              className={styles.primaryCta}
              onClick={() => {
                if (typeof window !== "undefined" && typeof window.print === "function") {
                  window.print();
                }
              }}
            >
              {locale === "bn" ? "স্লিপ প্রিন্ট করুন" : "Print slip"}
            </button>
          </div>

          <EmergencySlip
            referenceCode={savedItem.provisionalCode}
            isProvisional={true}
            identityText={savedItem.payload.unverified_description ?? "Unconfirmed"}
            reason={savedItem.payload.reason}
            urgency={savedItem.payload.urgency}
            vitals={savedItem.payload.vitals.items}
            vitalsRecordedAt={savedItem.payload.vitals.recorded_at}
            treatmentGiven={savedItem.payload.treatment_given}
            sendingFacility="Mirzapur Upazila Health Complex"
            receivingFacility="Tangail 250-Bed District Hospital"
            createdAt={savedItem.createdAtDevice}
            locale={locale}
          />
        </section>
      )}
    </main>
  );
}
