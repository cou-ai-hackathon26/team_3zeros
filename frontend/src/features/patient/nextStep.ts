import type { Appointment, ConsentRequest, ConsentsResponse, TriageSessionDetail } from "../../api/queries/types";

export type NextStep =
  | { kind: "consent"; request: ConsentRequest }
  | { kind: "alternate"; appointment: Appointment }
  | { kind: "requested"; appointment: Appointment }
  | { kind: "confirmed"; appointment: Appointment }
  | { kind: "triage"; session: TriageSessionDetail }
  | { kind: "none" };

const OPEN_TRIAGE_STATES = new Set(["CREATED", "ACTIVE", "PAUSED", "SUMMARY_PENDING_REVIEW"]);

const newest = (a: Appointment[]) => [...a].sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at))[0];
const earliest = (a: Appointment[]) => [...a].sort((x, y) => Date.parse(x.slot.start) - Date.parse(y.slot.start))[0];

/**
 * The first thing that applies, from real data only (APPLICATION_DESIGN §4.2):
 * 1. Pending consent request
 * 2. Appointment with alternate slot proposed
 * 3. Appointment waiting for doctor decision
 * 4. Earliest confirmed appointment
 * 5. Open triage session (ACTIVE / PAUSED / SUMMARY_PENDING_REVIEW)
 * 6. None -> primary Start talking / Type instead hero
 */
export function pickNextStep(
  appointments: Appointment[],
  consents: ConsentsResponse,
  triageSessions: TriageSessionDetail[] = [],
): NextStep {
  const pending = consents.pending_requests.filter((r) => r.state === "PENDING");
  if (pending.length) return { kind: "consent", request: pending[0] };
  const inState = (...states: string[]) => appointments.filter((a) => states.includes(a.state));
  const alternate = inState("ALTERNATE_SLOT_PROPOSED");
  if (alternate.length) return { kind: "alternate", appointment: newest(alternate) };
  const waiting = inState("REQUESTED", "PATIENT_ACCEPTED");
  if (waiting.length) return { kind: "requested", appointment: newest(waiting) };
  const confirmed = inState("CONFIRMED");
  if (confirmed.length) return { kind: "confirmed", appointment: earliest(confirmed) };
  const openTriage = triageSessions.find((s) => OPEN_TRIAGE_STATES.has(s.state));
  if (openTriage) return { kind: "triage", session: openTriage };
  return { kind: "none" };
}
