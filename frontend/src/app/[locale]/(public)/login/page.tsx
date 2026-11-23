"use client";

import React, { useState } from "react";
import { normalizeDigits } from "@/i18n/format";
import { type LocalePageProps } from "@/app/resolveLocale";
import { usePageLocale } from "@/app/usePageLocale";
import { SiteNav } from "@/components/SiteNav/SiteNav";
import styles from "@/app/[locale]/screens.module.css";

/**
 * FRONTEND §4 & SECURITY §3.1:
 * - Patient sign-in: Phone OTP (6 digits, normalized from Bangla/Latin digits).
 * - Clinician/staff sign-in: Password + MFA verification step (Q-13).
 */
export default function LoginPage({ params }: LocalePageProps) {
  const locale = usePageLocale(params, "bn");
  const [tab, setTab] = useState<"patient" | "clinician">("patient");
  const [phone, setPhone] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaStep, setMfaStep] = useState(false);

  return (
    <div>
      <SiteNav area="patient" locale={locale} />
      <main className={styles.pageShell}>
        <h1 className={styles.patientTitle}>
          {locale === "bn" ? "সাইন ইন করুন" : "Sign in to Medi Waypoint"}
        </h1>

        <div className={styles.chipRow} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "patient"}
            className={`${styles.filterChip} ${tab === "patient" ? styles.filterChipActive : ""}`}
            onClick={() => setTab("patient")}
          >
            {locale === "bn" ? "রোগী (ফোন ওটিপি)" : "Patient (Phone OTP)"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "clinician"}
            className={`${styles.filterChip} ${tab === "clinician" ? styles.filterChipActive : ""}`}
            onClick={() => setTab("clinician")}
          >
            {locale === "bn" ? "ডাক্তার ও হাসপাতাল কর্মী" : "Clinician & Staff"}
          </button>
        </div>

        {tab === "patient" ? (
          <form
            className={styles.formStack}
            onSubmit={(e) => {
              e.preventDefault();
              setOtpRequested(true);
            }}
          >
            <div className={styles.fieldGroup}>
              <label htmlFor="patient-phone" className={styles.fieldLabel}>
                {locale === "bn" ? "মোবাইল নম্বর" : "Mobile number"}
              </label>
              <input
                id="patient-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(normalizeDigits(e.target.value))}
                className={styles.textField}
                required
              />
            </div>
            {otpRequested && (
              <div className={styles.fieldGroup}>
                <label htmlFor="patient-otp" className={styles.fieldLabel}>
                  {locale === "bn" ? "৬ সংখ্যার ওটিপি কোড" : "6-digit OTP code"}
                </label>
                <input
                  id="patient-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(normalizeDigits(e.target.value))}
                  className={styles.textField}
                  required
                />
              </div>
            )}
            <button type="submit" className={styles.primaryCta}>
              {otpRequested
                ? locale === "bn"
                  ? "কোড যাচাই করুন"
                  : "Verify OTP"
                : locale === "bn"
                  ? "ওটিপি কোড পাঠান"
                  : "Send OTP code"}
            </button>
          </form>
        ) : (
          <form
            className={styles.formStack}
            onSubmit={(e) => {
              e.preventDefault();
              setMfaStep(true);
            }}
          >
            <div className={styles.fieldGroup}>
              <label htmlFor="clinician-email" className={styles.fieldLabel}>
                {locale === "bn" ? "ইমেইল বা নিবন্ধিত ফোন" : "Email or registered phone"}
              </label>
              <input
                id="clinician-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.textField}
                required
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="clinician-password" className={styles.fieldLabel}>
                {locale === "bn" ? "পাসওয়ার্ড" : "Password"}
              </label>
              <input
                id="clinician-password"
                type="password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.textField}
                required
              />
            </div>
            {mfaStep && (
              <div className={styles.fieldGroup}>
                <label htmlFor="clinician-mfa" className={styles.fieldLabel}>
                  {locale === "bn" ? "এমএফএ যাচাইকরণ কোড (Q-13)" : "MFA verification code (Q-13)"}
                </label>
                <input
                  id="clinician-mfa"
                  type="text"
                  inputMode="numeric"
                  className={styles.textField}
                  required
                />
              </div>
            )}
            <button type="submit" className={styles.primaryCta}>
              {locale === "bn" ? "সাইন ইন করুন" : "Sign in"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
