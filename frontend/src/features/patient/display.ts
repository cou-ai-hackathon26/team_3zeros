import type { Locale } from "../../i18n/config";
import type { StatusTone } from "../../components/StatusBadge/StatusBadge";

/** Name in the reader's script, falling back to the other one. */
export function pickName(locale: Locale, en: string, bn?: string | null): string {
  return locale === "bn" ? bn || en : en || bn || "";
}

/** Appointment states that are still open for the patient. */
export const APPOINTMENT_IN_PROGRESS = ["REQUESTED", "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED"] as const;

export function appointmentTone(state: string): StatusTone {
  if (state === "CONFIRMED") return "positive";
  if (state === "REQUESTED" || state === "PATIENT_ACCEPTED") return "active";
  if (state === "ALTERNATE_SLOT_PROPOSED") return "attention";
  return "neutral";
}

/** Fills `{name}`-style placeholders in a message. */
export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
}

/**
 * Consent purposes and categories arrive as backend codes ("referral_treatment"). Real patient-facing
 * wording comes from the approved consent policy (Q-07); until then show the code as readable text.
 */
export function humanizeCode(value: string): string {
  if (/\s/.test(value) || !/^[a-z0-9_.-]+$/.test(value)) return value;
  const text = value.replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
