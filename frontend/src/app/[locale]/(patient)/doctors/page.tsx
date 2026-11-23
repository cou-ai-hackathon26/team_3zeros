"use client";

import React, { useState, useEffect } from "react";
import { RouteLine } from "../../../../components/RouteLine/RouteLine";
import { type LocalePageProps } from "../../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../../screens.module.css";

interface DoctorDirectoryEntry {
  id: string;
  registrationNumber: string;
  nameEn: string;
  nameBn: string;
  specialtyCode: string;
  specialtyEn: string;
  specialtyBn: string;
  facilityEn: string;
  facilityBn: string;
  areaEn: string;
  areaBn: string;
  nextSlot: string;
  slots: string[];
  capacityNoteEn: string;
  capacityNoteBn: string;
}

const INITIAL_DOCTORS: DoctorDirectoryEntry[] = [
  {
    id: "prac-1",
    registrationNumber: "BMDC-A-41209",
    nameEn: "Dr. Rahima Khatun",
    nameBn: "ডা. রহিমা খাতুন",
    specialtyCode: "medicine",
    specialtyEn: "Medicine",
    specialtyBn: "মেডিসিন",
    facilityEn: "Tangail 250-Bed District Hospital",
    facilityBn: "টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল",
    areaEn: "Tangail Sadar",
    areaBn: "টাঙ্গাইল সদর",
    nextSlot: "Thu 10:30",
    slots: ["Thu 10:30", "Thu 11:30", "Sun 09:30"],
    capacityNoteEn: "Reported 3 hours ago by Tangail Facility Desk (18 beds open, ~25m OPD wait)",
    capacityNoteBn: "৩ ঘণ্টা আগে টাঙ্গাইল হাসপাতাল ডেস্ক কর্তৃক প্রতিবেদিত (১৮টি শয্যা খালি, বহির্বিভাগ অপেক্ষা ~২৫ মিনিট)",
  },
  {
    id: "prac-2",
    registrationNumber: "BMDC-A-38914",
    nameEn: "Dr. Mahmudul Hasan",
    nameBn: "ডা. মাহমুদুল হাসান",
    specialtyCode: "pediatrics",
    specialtyEn: "Pediatrics",
    specialtyBn: "শিশু বিভাগ",
    facilityEn: "Mirzapur Upazila Health Complex",
    facilityBn: "মির্জাপুর উপজেলা স্বাস্থ্য কমপ্লেক্স",
    areaEn: "Mirzapur",
    areaBn: "মির্জাপুর উপজেলা",
    nextSlot: "Fri 09:30",
    slots: ["Fri 09:30", "Sun 10:00", "Mon 11:00"],
    capacityNoteEn: "Reported 1 day ago by Mirzapur UHC Admin (11 beds open, ~15m OPD wait)",
    capacityNoteBn: "১ দিন আগে মির্জাপুর ইউএইচসি প্রশাসন কর্তৃক প্রতিবেদিত (১১টি শয্যা খালি)",
  },
  {
    id: "prac-3",
    registrationNumber: "BMDC-A-52103",
    nameEn: "Dr. Farzana Akter",
    nameBn: "ডা. ফারজানা আক্তার",
    specialtyCode: "gynecology",
    specialtyEn: "Gynecology & Obstetrics",
    specialtyBn: "স্ত্রীরোগ ও প্রসূতিবিদ্যা",
    facilityEn: "Tangail 250-Bed District Hospital",
    facilityBn: "টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল",
    areaEn: "Tangail Sadar",
    areaBn: "টাঙ্গাইল সদর",
    nextSlot: "Sun 10:00",
    slots: ["Sun 10:00", "Mon 10:30", "Tue 09:30"],
    capacityNoteEn: "Reported 3 hours ago by Tangail Facility Desk (Maternity unit open)",
    capacityNoteBn: "৩ ঘণ্টা আগে টাঙ্গাইল হাসপাতাল ডেস্ক কর্তৃক প্রতিবেদিত (প্রসূতি ইউনিট চালু)",
  },
  {
    id: "prac-4",
    registrationNumber: "BMDC-A-29870",
    nameEn: "Dr. Anisur Rahman",
    nameBn: "ডা. আনিসুর রহমান",
    specialtyCode: "cardiology",
    specialtyEn: "Cardiology",
    specialtyBn: "হৃদরোগ বিভাগ",
    facilityEn: "Dhaka Medical College Hospital",
    facilityBn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
    areaEn: "Dhaka Division",
    areaBn: "ঢাকা বিভাগ",
    nextSlot: "Mon 11:30",
    slots: ["Mon 11:30", "Wed 10:00"],
    capacityNoteEn: "Reported 2 hours ago by DMCH Desk (42 general beds open, CCU active)",
    capacityNoteBn: "২ ঘণ্টা আগে ডিএমসিএইচ ডেস্ক কর্তৃক প্রতিবেদিত (৪২টি সাধারণ শয্যা খালি)",
  },
];

/**
 * UIUX §6.5 & MASTERPLAN INV-14:
 * - Filters as a single row of chips: area (division -> district -> upazila), specialty, "Available this week".
 * - Results are a left-aligned list, not cards.
 * - Capacity shows "Reported X ago by …" (INV-14), never a live-looking indicator.
 * - Interactive slot picker & connects directly to appointment request status screen (/appointments/appt-101).
 */
export default function DoctorDiscoveryPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "en");
  const [doctors, setDoctors] = useState<DoctorDirectoryEntry[]>(INITIAL_DOCTORS);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [availableThisWeek, setAvailableThisWeek] = useState<boolean>(true);
  const [selectedSlotByDoc, setSelectedSlotByDoc] = useState<Record<string, string>>({});
  const [liveSynced, setLiveSynced] = useState(false);

  // Sync with live Django backend /api/v1/directory/practitioners when running
  useEffect(() => {
    if (typeof window === "undefined" || typeof fetch !== "function") return;
    fetch("/api/v1/directory/practitioners")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        const items = Array.isArray(payload?.results) ? payload.results : null;
        if (items && items.length > 0) {
          setLiveSynced(true);
          // Merge backend IDs with rich bilingual display attributes
          setDoctors((prev) =>
            prev.map((doc) => {
              const match = items.find(
                (it: { registration_number?: string; name?: string }) =>
                  it.registration_number === doc.registrationNumber ||
                  it.name === doc.nameEn
              );
              return match?.id ? { ...doc, id: String(match.id) } : doc;
            })
          );
        }
      })
      .catch(() => {
        // Keep initial doctors list
      });
  }, []);

  const filtered = doctors.filter((doc) =>
    selectedSpecialty === "all" ? true : doc.specialtyCode === selectedSpecialty
  );

  return (
    <main className={styles.pageShell}>
      <div className={styles.heroHeader}>
        <h1 className={styles.patientTitle}>
          {locale === "bn" ? "উপযুক্ত ডাক্তার খুঁজুন" : "Find a suitable doctor"}
        </h1>
        <RouteLine
          entity="appointment"
          currentState="REQUESTED"
          objectId="discovery-preview"
          variant="clinician"
          locale={locale}
        />
      </div>

      <div className={styles.chipRow} role="group" aria-label="Discovery filters">
        <button
          type="button"
          className={`${styles.filterChip} ${selectedSpecialty === "all" ? styles.filterChipActive : ""}`}
          onClick={() => setSelectedSpecialty("all")}
        >
          {locale === "bn" ? "ঢাকা › টাঙ্গাইল › সকল বিভাগ" : "Dhaka › Tangail › All specialties"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${selectedSpecialty === "medicine" ? styles.filterChipActive : ""}`}
          onClick={() => setSelectedSpecialty("medicine")}
        >
          {locale === "bn" ? "মেডিসিন" : "Medicine"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${selectedSpecialty === "pediatrics" ? styles.filterChipActive : ""}`}
          onClick={() => setSelectedSpecialty("pediatrics")}
        >
          {locale === "bn" ? "শিশু বিভাগ" : "Pediatrics"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${selectedSpecialty === "gynecology" ? styles.filterChipActive : ""}`}
          onClick={() => setSelectedSpecialty("gynecology")}
        >
          {locale === "bn" ? "স্ত্রীরোগ ও প্রসূতি" : "Gynecology"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${selectedSpecialty === "cardiology" ? styles.filterChipActive : ""}`}
          onClick={() => setSelectedSpecialty("cardiology")}
        >
          {locale === "bn" ? "হৃদরোগ" : "Cardiology"}
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${availableThisWeek ? styles.filterChipActive : ""}`}
          onClick={() => setAvailableThisWeek((v) => !v)}
        >
          {locale === "bn" ? "এই সপ্তাহে সময় আছে" : "Available this week"}
        </button>
      </div>

      <ul className={styles.plainList}>
        {filtered.map((doc) => {
          const activeSlot = selectedSlotByDoc[doc.id] ?? doc.nextSlot;
          return (
            <li key={doc.id} className={styles.plainListRow}>
              <div className={styles.topBar}>
                <div>
                  <div className={styles.doctorTitle}>
                    <span lang="bn">{doc.nameBn}</span>{" "}
                    <span lang="en">({doc.nameEn})</span>
                  </div>
                  <div className={styles.rowSubMeta}>
                    {locale === "bn"
                      ? `${doc.specialtyBn} • ${doc.facilityBn} (${doc.areaBn})`
                      : `${doc.specialtyEn} • ${doc.facilityEn} (${doc.areaEn})`}
                  </div>
                </div>
                <a
                  href={`/${locale}/appointments/appt-101`}
                  className={`${styles.filterChip} ${styles.filterChipActive}`}
                >
                  {locale === "bn" ? "সাক্ষাতের অনুরোধ করুন" : "Request appointment"}
                </a>
              </div>

              <div className={styles.slotPickerRow}>
                <span className={styles.slotPickerLabel}>
                  {locale === "bn"
                    ? `পরবর্তী খালি সময়: ${activeSlot}`
                    : `Next available slot: ${activeSlot}`}
                </span>
                <div className={styles.chipRow}>
                  {doc.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`${styles.slotPill} ${activeSlot === slot ? styles.slotPillActive : ""}`}
                      onClick={() =>
                        setSelectedSlotByDoc((prev) => ({ ...prev, [doc.id]: slot }))
                      }
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.capacityMeta}>
                {locale === "bn" ? doc.capacityNoteBn : doc.capacityNoteEn}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
