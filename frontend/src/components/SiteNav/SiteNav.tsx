"use client";

import React from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "../../i18n/config";
import { usePageLocale } from "../../app/usePageLocale";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import styles from "./SiteNav.module.css";

export interface SiteNavProps {
  area: "patient" | "clinician" | "admin";
  locale?: Locale;
  facilitySlot?: React.ReactNode;
  onLanguageChange?: (next: Locale) => void;
}

interface NavLinkItem {
  href: string;
  labelBn: string;
  labelEn: string;
  urgent?: boolean;
}

const PATIENT_LINKS: NavLinkItem[] = [
  { href: "", labelBn: "হোম", labelEn: "Home" },
  { href: "/triage", labelBn: "সমস্যা বলুন", labelEn: "Triage" },
  { href: "/doctors", labelBn: "ডাক্তার খুঁজুন", labelEn: "Find Doctor" },
  { href: "/appointments", labelBn: "অ্যাপয়েন্টমেন্ট", labelEn: "Appointments" },
  { href: "/consents/req-1", labelBn: "তথ্য সম্মতি", labelEn: "Consents" },
  { href: "/reports", labelBn: "রিপোর্ট", labelEn: "Reports" },
];

const CLINICIAN_LINKS: NavLinkItem[] = [
  { href: "/dashboard", labelBn: "কিউ ড্যাশবোর্ড", labelEn: "Queue" },
  { href: "/referrals/incoming", labelBn: "আগত রেফারেল", labelEn: "Incoming" },
  { href: "/referrals/outgoing", labelBn: "প্রেরিত রেফারেল", labelEn: "Outgoing" },
  { href: "/referrals/ref-0104", labelBn: "রেফারেল ওয়ার্কস্পেস", labelEn: "Workspace" },
  { href: "/referrals/new", labelBn: "নতুন খসড়া", labelEn: "New Draft" },
  { href: "/patients/pat-1", labelBn: "রোগীর চার্ট", labelEn: "Patient Chart" },
  { href: "/patients/pat-1/reports/doc-1/verify", labelBn: "রিপোর্ট যাচাই", labelEn: "Verify OCR" },
  { href: "/emergency", labelBn: "জরুরি রেফারেল", labelEn: "Emergency", urgent: true },
];

const ADMIN_LINKS: NavLinkItem[] = [
  { href: "/facility", labelBn: "হাসপাতাল ডিরেক্টরি", labelEn: "Facility" },
  { href: "/schedules", labelBn: "ডাক্তার স্লট", labelEn: "Schedules" },
  { href: "/capacity", labelBn: "সক্ষমতা রিপোর্ট", labelEn: "Capacity" },
  { href: "/staff", labelBn: "কর্মী ব্যবস্থাপনা", labelEn: "Staff" },
];

function BrandWaypointSvg() {
  return (
    <svg
      width="34"
      height="16"
      viewBox="0 0 34 16"
      fill="none"
      aria-hidden="true"
      className={styles.brandSvg}
    >
      <line
        x1="5"
        y1="8"
        x2="25"
        y2="8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="8" r="3.5" fill="var(--color-forest)" />
      <circle
        cx="26"
        cy="8"
        r="5"
        fill="var(--color-paper)"
        stroke="var(--color-turmeric)"
        strokeWidth="2.8"
      />
      <circle cx="26" cy="8" r="2" fill="var(--color-ink)" />
    </svg>
  );
}

function StopNodeSvg({ active, urgent }: { active: boolean; urgent?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={styles.stopSvg}
    >
      {urgent ? (
        <rect
          x="2"
          y="2"
          width="8"
          height="8"
          rx="1.5"
          fill="var(--color-signal)"
        />
      ) : active ? (
        <>
          <circle
            cx="6"
            cy="6"
            r="4.5"
            fill="var(--color-paper)"
            stroke="var(--color-turmeric)"
            strokeWidth="2.5"
          />
          <circle cx="6" cy="6" r="1.8" fill="var(--color-ink)" />
        </>
      ) : (
        <circle
          cx="6"
          cy="6"
          r="3.5"
          fill="var(--color-paper)"
          stroke="var(--color-line)"
          strokeWidth="1.75"
        />
      )}
    </svg>
  );
}

export function SiteNav({
  area,
  locale: propLocale,
  facilitySlot,
  onLanguageChange,
}: SiteNavProps) {
  const detectedLocale = usePageLocale(
    propLocale ? { locale: propLocale } : undefined,
    area === "patient" ? "bn" : "en"
  );
  const locale = propLocale ?? detectedLocale;

  let pathname = "";
  try {
    pathname = usePathname() ?? "";
  } catch {
    pathname = "";
  }

  const links =
    area === "clinician"
      ? CLINICIAN_LINKS
      : area === "admin"
        ? ADMIN_LINKS
        : PATIENT_LINKS;

  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.brandGroup}>
          <a href={`/${locale}`} className={styles.brandLink}>
            <BrandWaypointSvg />
            <span className={styles.brandText}>Medi Waypoint</span>
          </a>

          <nav
            className={styles.areaSwitcher}
            aria-label={locale === "bn" ? "পোর্টাল নির্বাচন" : "Workspace switcher"}
          >
            <a
              href={`/${locale}`}
              className={`${styles.areaLink} ${area === "patient" ? styles.areaActive : ""}`}
            >
              {locale === "bn" ? "রোগী" : "Patient"}
            </a>
            <a
              href={`/${locale}/dashboard`}
              className={`${styles.areaLink} ${area === "clinician" ? styles.areaActive : ""}`}
            >
              {locale === "bn" ? "ডাক্তার" : "Clinician"}
            </a>
            <a
              href={`/${locale}/facility`}
              className={`${styles.areaLink} ${area === "admin" ? styles.areaActive : ""}`}
            >
              {locale === "bn" ? "প্রশাসন" : "Admin"}
            </a>
          </nav>
        </div>

        <div className={styles.rightControls}>
          {facilitySlot}
          <a href={`/${locale}/login`} className={styles.signInLink}>
            {locale === "bn" ? "সাইন ইন" : "Sign in"}
          </a>
          <LanguageSwitch locale={locale} onChange={onLanguageChange} />
        </div>
      </div>

      <div className={styles.subNavWrapper}>
        <nav
          className={`${styles.subNav} ${area === "clinician" ? styles.condensedNav : ""}`}
          aria-label={locale === "bn" ? "প্রধান মেনু" : "Section navigation"}
        >
          {links.map((item) => {
            const fullHref = `/${locale}${item.href}`;
            const isCurrent =
              item.href === ""
                ? pathname === `/${locale}` || pathname === `/${locale}/`
                : pathname === fullHref || pathname.startsWith(`${fullHref}/`);
            return (
              <a
                key={item.href || "home"}
                href={fullHref}
                aria-current={isCurrent ? "page" : undefined}
                className={`${styles.navItem} ${isCurrent ? styles.navItemCurrent : ""} ${
                  item.urgent ? styles.navItemUrgent : ""
                }`}
              >
                <StopNodeSvg active={isCurrent} urgent={item.urgent} />
                <span>{locale === "bn" ? item.labelBn : item.labelEn}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
