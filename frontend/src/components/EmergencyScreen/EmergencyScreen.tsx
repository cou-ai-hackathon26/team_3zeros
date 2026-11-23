import React from "react";
import type { DirectoryFacilityEntry } from "../../api/queries/types";
import type { Locale } from "../../i18n/config";
import { formatTimeAgo, t } from "../../i18n/format";
import { fill, pickName } from "../../features/patient/display";

export interface EmergencyNumber {
  label: string;
  phone: string;
}

export interface EmergencyScreenProps {
  instructionText: string;
  emergencyNumbers?: EmergencyNumber[];
  locale: Locale;
  onShowNearestFacilities?: () => void;
  facilitiesRequested?: boolean;
  facilitiesLoading?: boolean;
  facilitiesError?: boolean;
  facilities?: DirectoryFacilityEntry[];
}

/**
 * UIUX §4.3, §5, §6.3 & MASTERPLAN INV-5, INV-8, INV-14, Q-06:
 * - Full-screen signal-wash background, zero transition, nothing on it moves.
 * - No further questions, no doctor booking, no "continue anyway" link.
 * - Clearly marks PLACEHOLDER — NOT CLINICALLY APPROVED content until Q-06 is approved.
 * - Nearest emergency facilities always show dated capacity (INV-14), never live status.
 */
export function EmergencyScreen({
  instructionText,
  emergencyNumbers = [],
  locale,
  onShowNearestFacilities,
  facilitiesRequested = false,
  facilitiesLoading = false,
  facilitiesError = false,
  facilities = [],
}: EmergencyScreenProps) {
  const isPlaceholder = instructionText.includes("PLACEHOLDER");
  const T = (k: string) => t(locale, `triage.${k}`);

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen w-full flex-col gap-6 bg-emergency-wash px-6 py-8 text-ink transition-none animate-none"
    >
      <h1 className="m-0 text-heading font-semibold">{T("emergencyHeading")}</h1>

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
          {T("emergencyShowFacilities")}
        </button>
      </div>

      {facilitiesRequested && (
        <div className="flex max-w-xl flex-col gap-3 rounded-panel border border-line-strong bg-surface p-4 text-ink">
          <h2 className="m-0 text-subheading font-semibold">{T("emergencyFacilitiesTitle")}</h2>
          {facilitiesLoading ? (
            <p className="m-0 text-dense text-ink-muted">{T("emergencyLoadingFacilities")}</p>
          ) : facilitiesError ? (
            <p className="m-0 text-dense text-signal">{T("emergencyFacilitiesError")}</p>
          ) : facilities.length === 0 ? (
            <p className="m-0 text-dense text-ink-muted">{T("emergencyFacilitiesEmpty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {facilities.map((fac) => (
                <li key={fac.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <span className="text-body font-semibold">
                    {pickName(locale, fac.name, fac.name_bn)}
                  </span>
                  {(fac.area_name || fac.address) && (
                    <span className="text-dense text-ink-muted">
                      {[pickName(locale, fac.area_name ?? "", fac.area_name_bn), fac.address]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                  {fac.phone && (
                    <a
                      href={`tel:${fac.phone}`}
                      className="inline-flex min-h-11 w-fit items-center text-dense font-semibold text-indigo underline underline-offset-2"
                    >
                      {fac.phone}
                    </a>
                  )}
                  {fac.latest_capacity && (
                    <span className="text-caption text-ink-muted">
                      {fill(t(locale, "doctors.reported"), {
                        ago: formatTimeAgo(fac.latest_capacity.reported_at, locale),
                        source: fac.latest_capacity.source,
                      })}
                      {fac.latest_capacity.is_stale && ` ${t(locale, "doctors.stale")}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
