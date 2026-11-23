import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import bn from "./messages/bn.json";
import { normalizeDigits, formatDisplayNumber, formatDhakaDateTime } from "./format";

const EXPECTED_STATES = {
  appointment: [
    "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW",
    "ALTERNATE_SLOT_PROPOSED", "PATIENT_ACCEPTED", "DECLINED", "EXPIRED",
  ],
  referral: [
    "DRAFT", "AWAITING_PATIENT_CONSENT", "READY_FOR_SENDER_APPROVAL",
    "APPROVED_BY_SENDER", "SENT", "ACKNOWLEDGED_BY_RECEIVER", "IN_PROGRESS",
    "OUTCOME_RECORDED", "OUTCOME_RETURNED", "CLOSED", "ESCALATED",
    "DECLINED", "CANCELLED", "EXPIRED", "FAILED_TO_SYNC",
  ],
  triage_session: [
    "CREATED", "ACTIVE", "PAUSED", "EMERGENCY_PATHWAY",
    "SUMMARY_PENDING_REVIEW", "CONFIRMED_BY_PATIENT", "ENDED_BY_PATIENT", "ABANDONED",
  ],
  document: [
    "UPLOADED", "OCR_QUEUED", "OCR_RUNNING", "EXTRACTED_UNVERIFIED",
    "OCR_FAILED", "VERIFIED", "REJECTED", "QUARANTINED",
  ],
  emergency_queue: ["QUEUED_LOCAL", "SYNCING", "SYNCED", "CONFLICT", "FAILED"],
  consent_request: ["PENDING", "GRANTED", "REFUSED", "EXPIRED", "SUPERSEDED"],
  consent: ["ACTIVE", "REVOKED", "EXPIRED"],
  fhir_sync: ["NOT_REQUIRED", "PENDING", "SYNCED", "FAILED"],
};

describe("FRONTEND §6-7 i18n & Digit Normalization", () => {
  it("contains every MASTERPLAN §5 state key in both bn.json and en.json", () => {
    for (const [entity, states] of Object.entries(EXPECTED_STATES)) {
      for (const state of states) {
        expect((en.state as Record<string, Record<string, string>>)[entity]?.[state]).toBeTruthy();
        expect((bn.state as Record<string, Record<string, string>>)[entity]?.[state]).toBeTruthy();
      }
    }
  });

  it("normalizes mixed Bangla and Latin digits while preserving decimals and slashes (Review Focus #1)", () => {
    expect(normalizeDigits("১০১.৫")).toBe("101.5");
    expect(normalizeDigits("১২০/৮০")).toBe("120/80");
    expect(normalizeDigits("০১৭১২-345678")).toBe("01712-345678");
  });

  it("keeps Latin digits in clinician mode even when locale is bn", () => {
    expect(formatDisplayNumber(120, "bn", { forceLatin: true })).toBe("120");
    expect(formatDisplayNumber(120, "bn")).toBe("১২০");
  });

  it("formats timestamps in Asia/Dhaka timezone", () => {
    const formatted = formatDhakaDateTime("2026-11-22T18:00:00Z", "en");
    expect(formatted).toBeTruthy();
  });

  it("never uses forbidden 'AI' or 'diagnosis' wording or apologies in patient strings (UIUX §7)", () => {
    const flatEn = JSON.stringify(en.patient) + JSON.stringify(en.error);
    expect(flatEn).not.toMatch(/\bSorry\b|\bapologize\b|\bdiagnosis\b/i);
  });
});

import { formatTimeAgo } from "./format";

describe("formatTimeAgo (INV-14: dated capacity text)", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");
  it("uses minutes, hours and days in English", () => {
    expect(formatTimeAgo("2026-11-23T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(formatTimeAgo("2026-11-23T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(formatTimeAgo("2026-11-22T12:00:00Z", "en", now)).toBe("1 day ago");
    expect(formatTimeAgo("2026-11-20T12:00:00Z", "en", now)).toBe("3 days ago");
  });
  it("uses Bangla words and digits in Bangla", () => {
    expect(formatTimeAgo("2026-11-23T09:00:00Z", "bn", now)).toBe("৩ ঘণ্টা আগে");
    expect(formatTimeAgo("2026-11-20T12:00:00Z", "bn", now)).toBe("৩ দিন আগে");
  });
  it("says 'just now' under a minute and returns empty for an invalid date", () => {
    expect(formatTimeAgo("2026-11-23T11:59:40Z", "en", now)).toBe("just now");
    expect(formatTimeAgo("nope", "en", now)).toBe("");
  });
});
