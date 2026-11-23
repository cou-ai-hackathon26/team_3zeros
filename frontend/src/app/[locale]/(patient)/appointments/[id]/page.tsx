"use client";

import React, { useState } from "react";
import { RouteLine } from "@/components/RouteLine/RouteLine";
import { ActionBar } from "@/components/ActionBar/ActionBar";
import { StatusLabel } from "@/components/StatusLabel/StatusLabel";
import { Toast } from "@/components/Toast/Toast";
import { t } from "@/i18n/format";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "@/app/[locale]/screens.module.css";

/**
 * UIUX §6.6: Appointment status (patient).
 * Vertical RouteLine with turmeric current stop ring + ActionBar rendering strictly allowed_actions.
 */
export default function PatientAppointmentDetailPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const [state, setState] = useState("REQUESTED");
  const [allowedActions, setAllowedActions] = useState<string[]>(["cancel"]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.patientTitle}>
            {locale === "bn" ? "ডা. রহিমা খাতুন (Dr. Rahima Khatun)" : "Dr. Rahima Khatun"}
          </h1>
          <p className={styles.capacityMeta}>
            {locale === "bn"
              ? "মেডিসিন বিশেষজ্ঞ • টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল • বৃহস্পতিবার সকাল ১০:৩০"
              : "Internal Medicine • Tangail 250-Bed District Hospital • Thursday 10:30 AM"}
          </p>
        </div>
        <StatusLabel
          entity="appointment"
          state={state}
          stopStatus={state === "CONFIRMED" ? "completed" : state === "CANCELLED" ? "exception" : "current"}
          locale={locale}
        />
      </header>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          {locale === "bn" ? "অ্যাপয়েন্টমেন্টের বর্তমান ধাপ" : "Appointment progress route"}
        </h2>
        <RouteLine
          entity="appointment"
          currentState={state}
          objectId="appt-101"
          variant="patient"
          locale={locale}
        />
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          {locale === "bn" ? "সংযুক্ত ট্রায়াজ সারাংশ" : "Attached triage summary"}
        </h2>
        <p className={styles.quoteBlock}>
          {locale === "bn"
            ? "“৩ দিন ধরে জ্বর ও মাথাব্যথা (রোগীর নিশ্চিতকৃত সারাংশ সংযুক্ত)”"
            : "“Fever and headache for 3 days (Patient-confirmed summary attached)”"}
        </p>
      </section>

      <ActionBar
        entity="appointment"
        allowedActions={allowedActions}
        isPending={false}
        locale={locale}
        onAction={(action) => {
          if (action === "cancel") {
            setState("CANCELLED");
            setAllowedActions([]);
            setToastMsg(t(locale, "toast.appointment.cancel"));
          }
        }}
      />

      {toastMsg && <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />}
    </main>
  );
}
