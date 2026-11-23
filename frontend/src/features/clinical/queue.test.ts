import { describe, expect, it } from "vitest";
import { buildEntries, countsByTab, entriesForTab, visibleTabs, toQueueItem } from "./queue";
import type { Appointment, Referral } from "../../api/queries/types";
import type { UserMe } from "../../auth/types";

const appt = (id: string, state: string, created = "2026-11-23T08:00:00Z"): Appointment =>
  ({ id, state, patient_id: "p" + id, practitioner_name: "Dr. A", facility_name: "F", slot: { id: "s", start: "2026-11-25T10:00:00Z", end: "2026-11-25T10:30:00Z" }, allowed_actions: [], version: 1, created_at: created, updated_at: created, history: [] }) as unknown as Appointment;
const ref = (id: string, state: string, o: Partial<Referral> = {}): Referral =>
  ({ id, state, patient_id: "p" + id, patient_name: "Karim", urgency: "routine", reason: "Chest pain", created_at: "2026-11-23T08:00:00Z", allowed_actions: [], history: [], version: 1, ...o }) as unknown as Referral;
const user = (roles: string[], permissions: string[] = []): UserMe => ({ id: "u", email: null, phone: null, display_name: "T", preferred_language: "en", roles, permissions, active_facility: null, is_platform_admin: false });

describe("clinical queue (APPLICATION_DESIGN §5.2)", () => {
  const entries = buildEntries(
    [appt("a1", "REQUESTED"), appt("a2", "CONFIRMED"), appt("a3", "PATIENT_ACCEPTED"), appt("a4", "DECLINED")],
    [ref("i1", "SENT"), ref("i2", "ESCALATED", { urgency: "emergency" }), ref("i3", "CLOSED"), ref("i4", "OUTCOME_RETURNED")],
    [ref("o1", "DRAFT"), ref("o2", "SENT"), ref("o3", "OUTCOME_RETURNED"), ref("o4", "CANCELLED")],
  );
  const ids = (tab: Parameters<typeof entriesForTab>[1]) => entriesForTab(entries, tab).map((e) => e.key);

  it("Needs you holds decisions waiting on this clinician: appointment requests, referrals to acknowledge, drafts and outcomes to close", () => {
    expect(ids("needs").sort()).toEqual(["appt:a1", "appt:a3", "in:i1", "in:i2", "out:o1", "out:o3"].sort());
  });

  it("Incoming and Outgoing list open referrals only, never finished ones", () => {
    expect(ids("incoming").sort()).toEqual(["in:i1", "in:i2"]);
    expect(ids("outgoing").sort()).toEqual(["out:o1", "out:o2", "out:o3"]);
  });

  it("an incoming referral already in OUTCOME_RETURNED is the sender's, not the receiver's, so it needs no one here", () => {
    expect(ids("needs")).not.toContain("in:i4");
    expect(ids("incoming")).not.toContain("in:i4");
  });

  it("To verify has no list endpoint (G-1) so it is empty", () => {
    expect(ids("verify")).toEqual([]);
  });

  it("counts are plain numbers from the lists", () => {
    expect(countsByTab(entries)).toEqual({ needs: 6, incoming: 2, verify: 0, outgoing: 3 });
  });

  it("escalated referrals are flagged and carry their urgency", () => {
    const e = entries.find((x) => x.key === "in:i2")!;
    expect(e.escalated).toBe(true);
    expect(e.urgency).toBe("emergency");
    expect(entries.find((x) => x.key === "appt:a1")!.urgency).toBe("routine");
  });

  it("tabs are hidden by permission (AUTH_RBAC §5.3)", () => {
    expect(visibleTabs(user(["clinician"]))).toEqual(["needs", "incoming", "verify", "outgoing"]);
    expect(visibleTabs(user(["facility_staff"]))).toEqual(["needs"]);
    expect(visibleTabs(user(["facility_staff"], ["referral.acknowledge"]))).toEqual(["needs", "incoming"]);
  });

  it("toQueueItem names the patient from the patient record when known and falls back to the referral's given name", () => {
    const names = new Map([["pi1", { given_name: "Karim", family_name: "Uddin", name_bn: "করিম উদ্দিন" }]]);
    const item = toQueueItem(entries.find((x) => x.key === "in:i1")!, names as never, "en");
    expect(item).toMatchObject({ id: "in:i1", patientName: "Karim Uddin", patientNameBn: "করিম উদ্দিন", reason: "Chest pain" });
    expect(toQueueItem(entries.find((x) => x.key === "in:i2")!, new Map(), "en").patientName).toBe("Karim");
  });
});
