import React from "react";
import type { Locale } from "../../i18n/config";


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
 * - Full-screen signal-wash background, zero transition, nothing on it moves.
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
      className="flex min-h-screen w-full flex-col gap-6 bg-emergency-wash px-6 py-8 text-ink transition-none animate-none"
    >
      <h1 className="m-0 text-heading font-semibold">
        {locale === "bn"
          ? "এটি একটি জরুরি অবস্থা হতে পারে।"
          : "This may be an emergency."}
      </h1>

      {!isPlaceholder && (
        <div className="rounded-control border-[1.5px] border-dashed border-signal bg-surface px-3 py-2 text-caption font-semibold text-signal">
          PLACEHOLDER — NOT CLINICALLY APPROVED (Q-06)
        </div>
      )}

      <p className="m-0 text-body">{instructionText}</p>

      <div className="flex flex-col items-start gap-4">
        {emergencyNumbers.map((num) => (
          <a
            key={num.phone}
            href={`tel:${num.phone}`}
            className="flex min-h-12 w-full max-w-sm items-center justify-center rounded-control bg-signal px-6 text-body font-semibold text-surface no-underline"
          >
            {locale === "bn" ? `কল করুন ${num.label} (${num.phone})` : `Call ${num.label} (${num.phone})`}
          </a>
        ))}

        <button
          type="button"
          className="min-h-11 rounded-control border border-ink bg-surface px-4 text-body font-semibold text-ink"
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
