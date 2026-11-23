"use client";

import React, { useState } from "react";
import { StatusLabel } from "../../../../components/StatusLabel/StatusLabel";
import { RouteLine } from "../../../../components/RouteLine/RouteLine";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

const SAMPLE_APPOINTMENTS = [
  {
    id: "appt-101",
    doctorBn: "ডা. রহিমা খাতুন",
    doctorEn: "Dr. Rahima Khatun",
    specialtyBn: "মেডিসিন বিশেষজ্ঞ",
    specialtyEn: "Internal Medicine",
    facilityBn: "টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল",
    facilityEn: "Tangail 250-Bed District Hospital",
    slotBn: "বৃহস্পতিবার, সকাল ১০:৩০ – ১১:০০",
    slotEn: "Thursday, 10:30 – 11:00 AM",
    state: "REQUESTED",
    reasonBn: "৩ দিন ধরে জ্বর ও মাথাব্যথা (ট্রায়াজ সারাংশ সংযুক্ত)",
    reasonEn: "Fever and headache for 3 days (Triage summary attached)",
  },
  {
    id: "appt-102",
    doctorBn: "ডা. মাহমুদুল হাসান",
    doctorEn: "Dr. Mahmudul Hasan",
    specialtyBn: "শিশু বিশেষজ্ঞ",
    specialtyEn: "Pediatrics",
    facilityBn: "মির্জাপুর উপজেলা স্বাস্থ্য কমপ্লেক্স",
    facilityEn: "Mirzapur Upazila Health Complex",
    slotBn: "সোমবার, সকাল ০৯:৩০ – ১০:০০",
    slotEn: "Monday, 09:30 – 10:00 AM",
    state: "CONFIRMED",
    reasonBn: "নিয়মিত ফলো-আপ ও টিকা পরামর্শ",
    reasonEn: "Routine follow-up and immunization check",
  },
];

export default function PatientAppointmentsListPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const [filter, setFilter] = useState<"all" | "active" | "confirmed">("all");

  const visible = SAMPLE_APPOINTMENTS.filter((a) => {
    if (filter === "active") return a.state === "REQUESTED";
    if (filter === "confirmed") return a.state === "CONFIRMED";
    return true;
  });

  return (
    <main className={styles.pageShell}>
      <header className={styles.topBar}>
        <div>
          <h1 className={styles.patientTitle}>
            {locale === "bn" ? "আমার অ্যাপয়েন্টমেন্ট" : "My appointments"}
          </h1>
          <p className={styles.capacityMeta}>
            {locale === "bn"
              ? "আপনার পাঠানো সাক্ষাতের অনুরোধ এবং ডাক্তারের সিদ্ধান্তের বর্তমান অবস্থান"
              : "Track your appointment requests and confirmed visit slots"}
          </p>
        </div>
        <a href={`/${locale}/doctors`} className={styles.primaryCta}>
          {locale === "bn" ? "+ নতুন ডাক্তার খুঁজুন" : "+ Request new appointment"}
        </a>
      </header>

      <div className={styles.chipRow} role="group" aria-label="Appointment status filter">
        <button
          type="button"
          className={`${styles.filterChip} ${filter === "all" ? styles.filterChipActive : ""}`}
          onClick={() => setFilter("all")}
        >
          {locale === "bn" ? "সবগুলো (২)" : "All (2)"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${filter === "active" ? styles.filterChipActive : ""}`}
          onClick={() => setFilter("active")}
        >
          {locale === "bn" ? "ডাক্তারের সিদ্ধান্তের অপেক্ষায় (১)" : "Awaiting doctor decision (1)"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${filter === "confirmed" ? styles.filterChipActive : ""}`}
          onClick={() => setFilter("confirmed")}
        >
          {locale === "bn" ? "নিশ্চিতকৃত (১)" : "Confirmed (1)"}
        </button>
      </div>

      <ul className={styles.plainList}>
        {visible.map((appt) => (
          <li key={appt.id} className={styles.plainListRow}>
            <div className={styles.topBar}>
              <div>
                <div className={styles.doctorTitle}>
                  {locale === "bn" ? appt.doctorBn : appt.doctorEn} —{" "}
                  <span>{locale === "bn" ? appt.specialtyBn : appt.specialtyEn}</span>
                </div>
                <p className={styles.capacityMeta}>
                  {locale === "bn" ? appt.facilityBn : appt.facilityEn}
                </p>
              </div>
              <StatusLabel
                entity="appointment"
                state={appt.state}
                stopStatus={appt.state === "CONFIRMED" ? "completed" : "current"}
                locale={locale}
              />
            </div>

            <div>
              <strong>{locale === "bn" ? "নির্ধারিত সময়:" : "Requested slot:"}</strong>{" "}
              {locale === "bn" ? appt.slotBn : appt.slotEn}
            </div>
            <div className={styles.capacityMeta}>
              {locale === "bn" ? appt.reasonBn : appt.reasonEn}
            </div>

            <RouteLine
              entity="appointment"
              currentState={appt.state}
              objectId={appt.id}
              variant="clinician"
              locale={locale}
            />

            <div className={styles.topBar}>
              <a href={`/${locale}/appointments/${appt.id}`} className={styles.filterChip}>
                {locale === "bn"
                  ? "বিস্তারিত যাত্রাপথ ও অপশন দেখুন ›"
                  : "View full status route & actions ›"}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
