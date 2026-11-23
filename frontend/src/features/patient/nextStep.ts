import type { Appointment, ConsentRequest, ConsentsResponse } from "../../api/queries/types";

export type NextStep =
  | { kind: "consent"; request: ConsentRequest }
  | { kind: "alternate"; appointment: Appointment }
  | { kind: "requested"; appointment: Appointment }
  | { kind: "confirmed"; appointment: Appointment }
  | { kind: "none" };

const newest = (a: Appointment[]) => [...a].sort((x, y) => Date.parse(y.updated_at) - Date.parse(x.updated_at))[0];
const earliest = (a: Appointment[]) => [...a].sort((x, y) => Date.parse(x.slot.start) - Date.parse(y.slot.start))[0];

/**
 * The first thing that applies, from real data only (APPLICATION_DESIGN §4.2). Condition 5
 * (a triage session open in this tab, G-6) is not handled here; it belongs with the triage pages.
 */
export function pickNextStep(appointments: Appointment[], consents: ConsentsResponse): NextStep {
  const pending = consents.pending_requests.filter((r) => r.state === "PENDING");
  if (pending.length) return { kind: "consent", request: pending[0] };
  const inState = (...states: string[]) => appointments.filter((a) => states.includes(a.state));
  const alternate = inState("ALTERNATE_SLOT_PROPOSED");
  if (alternate.length) return { kind: "alternate", appointment: newest(alternate) };
  const waiting = inState("REQUESTED", "PATIENT_ACCEPTED");
  if (waiting.length) return { kind: "requested", appointment: newest(waiting) };
  const confirmed = inState("CONFIRMED");
  if (confirmed.length) return { kind: "confirmed", appointment: earliest(confirmed) };
  return { kind: "none" };
}
