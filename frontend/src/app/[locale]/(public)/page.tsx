"use client";

import React, { useState } from "react";
import type { Locale } from "../../../i18n/config";
import { getMessages } from "../../../i18n/format";
import { type LocalePageProps } from "../../resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import styles from "../screens.module.css";

function MicIconSvg() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function ChevronSvg() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.chevronSvg}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function WaypointStopSvg({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={styles.waypointNodeSvg}
    >
      {active ? (
        <>
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="var(--color-paper)"
            stroke="var(--color-turmeric)"
            strokeWidth="3"
          />
          <circle cx="10" cy="10" r="3.5" fill="var(--color-ink)" />
        </>
      ) : (
        <circle
          cx="10"
          cy="10"
          r="6"
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}

/**
 * UIUX §6.1: Patient home (mobile-first, Bangla default).
 * - Title set at width 112 (semi-expanded).
 * - 4-stop route preview: Tell us -> Doctor -> Visit -> Follow-up, linked to each journey screen.
 * - Automated guide disclaimer (never calls itself a doctor or AI).
 * - Full patient & clinical wayfinding links so every screen in the application is reachable.
 * - Primary "Start talking" + "Type instead" fallback.
 */
export default function PatientHomePage({ params }: LocalePageProps) {
  const initialLocale = usePageLocale(params, "bn");
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const msg = getMessages(locale);

  const routeHrefs = [
    `/${locale}/triage`,
    `/${locale}/doctors`,
    `/${locale}/appointments/appt-101`,
    `/${locale}/consents/req-1`,
  ];

  const routeDescriptions =
    locale === "bn"
      ? [
          "কথা বলে বা লিখে উপসর্গ জানান",
          "উপযুক্ত বিশেষজ্ঞ ও স্লট খুঁজুন",
          "সাক্ষাতের অবস্থা ট্র্যাক করুন",
          "সম্মতি ও পরবর্তী রেফারেল",
        ]
      : [
          "Speak or type your symptoms",
          "Match specialty & open slot",
          "Track visit confirmation",
          "Consent & follow-up care",
        ];

  return (
    <div>

      <main className={styles.homeShell}>
        <section className={styles.heroBoard} aria-label="Wayfinding journey stops">
          <div className={styles.heroIntro}>
            <h1 className={styles.patientTitle}>{msg.patient.homeTitle}</h1>
            <p className={styles.guideNotice}>{msg.patient.automatedGuideNotice}</p>
          </div>

          <div className={styles.transitTrackContainer}>
            <svg
              className={styles.transitConnectorSvg}
              viewBox="0 0 800 8"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="4"
                x2="800"
                y2="4"
                stroke="var(--color-line)"
                strokeWidth="2"
              />
              <line
                x1="0"
                y1="4"
                x2="200"
                y2="4"
                stroke="var(--color-turmeric)"
                strokeWidth="3"
              />
            </svg>

            <ol
              className={styles.routePreview}
              aria-label={locale === "bn" ? "যাত্রাপথের ধাপসমূহ" : "Care route steps"}
            >
              {msg.patient.routePreview.map((stepLabel, idx) => (
                <li
                  key={stepLabel}
                  className={`${styles.routePreviewStop} ${
                    idx === 0 ? styles.routePreviewFirst : ""
                  }`}
                >
                  <a href={routeHrefs[idx]} className={styles.routePreviewLink}>
                    <WaypointStopSvg active={idx === 0} />
                    <div className={styles.routeStopText}>
                      <span className={styles.routeStopTitle}>{stepLabel}</span>
                      <span className={styles.routeStopSub}>
                        {routeDescriptions[idx]}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.heroActionRow}>
            <a href={`/${locale}/triage?mode=voice`} className={styles.primaryCta}>
              <MicIconSvg />
              <span>{msg.patient.startTalking}</span>
            </a>
            <a href={`/${locale}/triage?mode=text`} className={styles.secondaryCta}>
              {msg.patient.typeInstead}
            </a>
          </div>
        </section>

        <div className={styles.directoryGrid}>
          <section
            className={styles.directoryColumn}
            aria-labelledby="patient-journey-heading"
          >
            <div className={styles.columnHeader}>
              <h2 id="patient-journey-heading" className={styles.sectionHeading}>
                {locale === "bn" ? "রোগীর সেবা ও যাত্রাপথ" : "Your care & records"}
              </h2>
            </div>

            <ul className={styles.navLinksList}>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/appointments`} className={styles.navLink}>
                  <div>
                    <div className={styles.navLinkTitleRow}>
                      <span>{msg.patient.myAppointments}</span>
                      <span className={styles.countPill}>2</span>
                    </div>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "ডা. রহিমা খাতুন — টাঙ্গাইল ২৫০ শয্যা জেলা হাসপাতাল"
                        : "Dr. Rahima Khatun — Tangail 250-Bed District Hospital"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/doctors`} className={styles.navLink}>
                  <div>
                    <div className={styles.navLinkTitleRow}>
                      <span>{msg.patient.findDoctor}</span>
                      <span className={styles.countPill}>4</span>
                    </div>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "বিভাগ, জেলা ও উপজেলা অনুযায়ী ডাক্তার এবং খালি স্লট খুঁজুন"
                        : "Browse doctors by division, district, upazila, and specialty"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/consents/req-1`} className={styles.navLink}>
                  <div>
                    <div className={styles.navLinkTitleRow}>
                      <span>
                        {locale === "bn"
                          ? "চিকিৎসা তথ্য শেয়ারের অনুমতি"
                          : "Record sharing permissions"}
                      </span>
                      <span className={styles.countPillActive}>
                        {locale === "bn" ? "১টি অপেক্ষমাণ" : "1 pending"}
                      </span>
                    </div>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "কোন তথ্য কোন ডাক্তারের সাথে শেয়ার হবে তা নির্ধারণ করুন"
                        : "Review and grant or refuse record sharing for your referral"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/reports`} className={styles.navLink}>
                  <div>
                    <div className={styles.navLinkTitleRow}>
                      <span>{msg.patient.myReports}</span>
                      <span className={styles.countPill}>2</span>
                    </div>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "যাচাইকৃত ল্যাব টেস্ট ও প্রেসক্রিপশন রিপোর্ট দেখুন"
                        : "View verified lab reports and clinical documents"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
            </ul>
          </section>

          <section
            className={styles.directoryColumn}
            aria-labelledby="clinician-admin-heading"
          >
            <div className={styles.columnHeader}>
              <h2 id="clinician-admin-heading" className={styles.sectionHeading}>
                {locale === "bn"
                  ? "ডাক্তার ও হাসপাতাল কর্মীদের পোর্টাল"
                  : "Clinician & facility workspaces"}
              </h2>
            </div>

            <ul className={styles.navLinksList}>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/dashboard`} className={styles.navLink}>
                  <div>
                    <span>
                      {locale === "bn"
                        ? "ডাক্তার ৩-প্যানেল কিউ ড্যাশবোর্ড"
                        : "Clinician 3-Pane Queue Workspace"}
                    </span>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "অ্যাপয়েন্টমেন্ট অনুমোদন, আগত রেফারেল ও রোগীর সংক্ষিপ্ত বিবরণ"
                        : "Decide appointment requests, review triage summaries, and inspect patient context"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/referrals/ref-0104`} className={styles.navLink}>
                  <div>
                    <span>
                      {locale === "bn"
                        ? "রেফারেল ওয়ার্কস্পেস (প্রেরক ও গ্রহণকারী)"
                        : "Closed-Loop Referral Workspace (REF-2026-0104)"}
                    </span>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "খসড়া সারাংশ, সূত্র চিপ, সম্মতি ও রেফারেল ট্র্যাকিং"
                        : "Review draft blocks with source chips, approve, send, acknowledge, and return outcomes"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a
                  href={`/${locale}/patients/pat-1/reports/doc-1/verify`}
                  className={styles.navLink}
                >
                  <div>
                    <span>
                      {locale === "bn"
                        ? "ল্যাব রিপোর্ট ওসিআর যাচাই (স্প্লিট ভিউ)"
                        : "Report OCR Verification Split View"}
                    </span>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "মূল রিপোর্ট বামে এবং শনাক্তকৃত মান ও পূর্ববর্তী ফলাফল ডানে"
                        : "Compare original scan bounding boxes with extracted lab values and prior results"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/emergency`} className={styles.navLink}>
                  <div>
                    <span>
                      {locale === "bn"
                        ? "জরুরি রেফারেল মোড ও প্রিন্ট স্লিপ (অফলাইন)"
                        : "Offline Emergency Referral Mode & Transfer Slip"}
                    </span>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "৫টি আবশ্যিক তথ্যে তাৎক্ষণিক রেফারেল ও এ৫/এ৬ প্রিন্ট স্লিপ"
                        : "5-field emergency transfer with encrypted IndexedDB offline queue and A5/A6 slip"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
              <li className={styles.navLinkRow}>
                <a href={`/${locale}/facility`} className={styles.navLink}>
                  <div>
                    <span>
                      {locale === "bn"
                        ? "হাসপাতাল প্রশাসন (ডিরেক্টরি, স্লট, সক্ষমতা ও কর্মী)"
                        : "Facility Administration (Directory, Schedules, Capacity, Staff)"}
                    </span>
                    <span className={styles.navLinkMeta}>
                      {locale === "bn"
                        ? "হাসপাতালের বিভাগ, ডাক্তারের সময়সূচি ও সক্ষমতা হালনাগাদ"
                        : "Manage facility services, clinician slots, dated capacity reports, and staff"}
                    </span>
                  </div>
                  <ChevronSvg />
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
