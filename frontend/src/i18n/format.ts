import type { Locale } from "./config";
import en from "./messages/en.json";
import bn from "./messages/bn.json";

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

const BANGLA_TO_LATIN_MAP: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

/**
 * Normalizes Bangla numerals (০-৯) to ASCII Latin digits (0-9) before API submission
 * while preserving decimals, slashes, hyphens, and spaces (FRONTEND §7, Review Focus #1).
 */
export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => BANGLA_TO_LATIN_MAP[ch] ?? ch);
}

export function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)] ?? d);
}

/**
 * Formats numbers for display. Patient UI in 'bn' shows Bangla digits;
 * clinician UI passes { forceLatin: true } for unambiguous vitals/labs entry (FRONTEND §7).
 */
export function formatDisplayNumber(
  value: number | string,
  locale: Locale,
  options?: { forceLatin?: boolean }
): string {
  const normalized = typeof value === "number" ? String(value) : normalizeDigits(value);
  if (options?.forceLatin || locale === "en") {
    return normalized;
  }
  return toBanglaDigits(normalized);
}

/**
 * Formats an ISO 8601 timestamp in Asia/Dhaka time (MASTERPLAN §6.1, FRONTEND §7).
 */
export function formatDhakaDateTime(
  iso: string,
  locale: Locale,
  options?: { forceLatin?: boolean }
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const formatter = new Intl.DateTimeFormat(locale === "bn" && !options?.forceLatin ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Formats elapsed waiting time for QueueList ("Waiting 2 h 10 min").
 */
export function formatWaitingAge(iso: string, locale: Locale, nowMs: number = Date.now()): string {
  const createdMs = new Date(iso).getTime();
  if (Number.isNaN(createdMs)) return "";
  const totalMinutes = Math.max(1, Math.floor((nowMs - createdMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (locale === "bn") {
    const hText = hours > 0 ? `${toBanglaDigits(String(hours))} ঘণ্টা ` : "";
    return `অপেক্ষমাণ ${hText}${toBanglaDigits(String(mins))} মিনিট`;
  }
  const hText = hours > 0 ? `${hours} h ` : "";
  return `Waiting ${hText}${mins} min`;
}

/** "3 hours ago" / "৩ ঘণ্টা আগে": how old a reported figure is (INV-14, capacity is never shown as live). */
export function formatTimeAgo(iso: string, locale: Locale, nowMs: number = Date.now()): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const minutes = Math.floor((nowMs - ms) / 60000);
  if (minutes < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  const [n, unitEn, unitBn] =
    minutes < 60 ? [minutes, "minute", "মিনিট"] : minutes < 1440 ? [Math.floor(minutes / 60), "hour", "ঘণ্টা"] : [Math.floor(minutes / 1440), "day", "দিন"];
  return locale === "bn" ? `${toBanglaDigits(String(n))} ${unitBn} আগে` : `${n} ${unitEn}${n === 1 ? "" : "s"} ago`;
}

export function getMessages(locale: Locale) {
  return locale === "bn" ? bn : en;
}

/**
 * Message namespaces that only some routes need (landing, auth). Each is registered by a module
 * that only those routes import, so its copy is not shipped in every route's JavaScript.
 */
const extraNamespaces: Record<Locale, Record<string, unknown>> = { bn: {}, en: {} };

export function registerMessages(namespace: string, messages: { en: unknown; bn: unknown }): void {
  extraNamespaces.en[namespace] = messages.en;
  extraNamespaces.bn[namespace] = messages.bn;
}

export function t(locale: Locale, dotPath: string): string {
  const parts = dotPath.split(".");
  const dict = (parts[0] in extraNamespaces[locale] ? extraNamespaces[locale] : getMessages(locale)) as Record<string, unknown>;
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return dotPath;
    }
  }
  return typeof cur === "string" ? cur : dotPath;
}
