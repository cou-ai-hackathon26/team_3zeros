export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_PATIENT_LOCALE: Locale = "bn";
export const DEFAULT_CLINICIAN_LOCALE: Locale = "en";
