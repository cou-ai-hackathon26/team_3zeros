import React from "react";
import type { Locale } from "../../i18n/config";
import styles from "./EmergencyScreen.module.css";

export interface EmergencyNumber {
  label: string;
  phone: string;
}

export interface EmergencyScreenProps {
  instructionText: string;
  emergencyNumbers?: EmergencyNumber[];
  locale: Locale;
  onShowNearestFacilities?: () => void;
}

/**
 * UIUX §4.3, §5, §6.3 & MASTERPLAN INV-5, INV-8, Q-06:
 * - Full-screen signal-wash background (#FBE9E7), zero transition, nothing on it moves.
 * - No further questions, no doctor booking, no "continue anyway" link.
 * - Clearly marks PLACEHOLDER — NOT CLINICALLY APPROVED content until Q-06 is approved.
 */
export function EmergencyScreen({
  instructionText,
  emergencyNumbers = [],
  locale,
  onShowNearestFacilities,
}: EmergencyScreenProps) {
  const isPlaceholder = instructionText.includes("PLACEHOLDER");

  return (
    <section
      role="alert"
      aria-live="assertive"
      className={styles.emergencyScreen}
    >
      <h1 className={styles.heading}>
        {locale === "bn"
          ? "এটি একটি জরুরি অবস্থা হতে পারে।"
          : "This may be an emergency."}
      </h1>

      {!isPlaceholder && (
        <div className={styles.placeholderNotice}>
          PLACEHOLDER — NOT CLINICALLY APPROVED (Q-06)
        </div>
      )}

      <p className={styles.instruction}>{instructionText}</p>

      <div className={styles.actions}>
        {emergencyNumbers.map((num) => (
          <a
            key={num.phone}
            href={`tel:${num.phone}`}
            className={styles.callButton}
          >
            {locale === "bn" ? `কল করুন ${num.label} (${num.phone})` : `Call ${num.label} (${num.phone})`}
          </a>
        ))}

        <button
          type="button"
          className={styles.facilitiesLink}
          onClick={onShowNearestFacilities}
        >
          {locale === "bn"
            ? "নিকটস্থ জরুরি হাসপাতালগুলো দেখুন"
            : "Show nearest emergency facilities"}
        </button>
      </div>
    </section>
  );
}
