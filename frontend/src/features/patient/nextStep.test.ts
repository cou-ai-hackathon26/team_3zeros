import { describe, expect, it } from "vitest";
import { pickNextStep } from "./nextStep";
import type { Appointment, ConsentRequest, ConsentsResponse } from "../../api/queries/types";

const appt = (id: string, state: string, start = "2026-11-25T10:00:00Z", updated = "2026-11-23T08:00:00Z"): Appointment =>
  ({ id, state, practitioner_name: "Dr. A", facility_name: "F", slot: { id: "s" + id, start, end: start }, updated_at: updated, allowed_actions: [], version: 1, created_at: updated, history: [], patient_id: "p", practitioner_id: "x", facility_id: "f" }) as Appointment;
const req = (id: string): ConsentRequest => ({ id, state: "PENDING", recipient_facility_name: "H", recipient_practitioner_name: "Dr. B", purpose: "x", categories: [], content_hash: "h", patient_id: "p", recipient_facility_id: "f", created_at: "2026-11-23T08:00:00Z" });
const consents = (pending: ConsentRequest[] = []): ConsentsResponse => ({ consents: [], pending_requests: pending });

describe("pickNextStep (APPLICATION_DESIGN §4.2)", () => {
  it("1: a pending consent request comes first, even over an appointment", () => {
    expect(pickNextStep([appt("1", "REQUESTED")], consents([req("c1")]))).toEqual({ kind: "consent", request: req("c1") });
  });
  it("2: a proposed new time is with the patient", () => {
    expect(pickNextStep([appt("1", "REQUESTED"), appt("2", "ALTERNATE_SLOT_PROPOSED")], consents()).kind).toBe("alternate");
  });
  it("3: requested or patient-accepted means waiting for the doctor", () => {
    expect(pickNextStep([appt("1", "PATIENT_ACCEPTED")], consents()).kind).toBe("requested");
    expect(pickNextStep([appt("1", "REQUESTED")], consents()).kind).toBe("requested");
  });
  it("4: confirmed shows the earliest upcoming visit", () => {
    const step = pickNextStep([appt("late", "CONFIRMED", "2026-12-01T10:00:00Z"), appt("soon", "CONFIRMED", "2026-11-25T10:00:00Z")], consents());
    expect(step.kind === "confirmed" && step.appointment.id).toBe("soon");
  });
  it("6: nothing applies for new accounts and for finished appointments only", () => {
    expect(pickNextStep([], consents())).toEqual({ kind: "none" });
    expect(pickNextStep([appt("1", "COMPLETED"), appt("2", "DECLINED")], consents())).toEqual({ kind: "none" });
  });
  it("among several waiting requests, the most recently updated wins", () => {
    const step = pickNextStep([appt("old", "REQUESTED", undefined, "2026-11-20T00:00:00Z"), appt("new", "REQUESTED", undefined, "2026-11-23T00:00:00Z")], consents());
    expect(step.kind === "requested" && step.appointment.id).toBe("new");
  });
});
