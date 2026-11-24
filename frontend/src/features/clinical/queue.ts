import type { Appointment, Patient, Referral } from "../../api/queries/types";
import { PERMISSIONS, can, hasRole } from "../../auth/access";
import type { UserMe } from "../../auth/types";
import type { Locale } from "../../i18n/config";
import { formatDhakaDateTime, t } from "../../i18n/format";
import { holderOf } from "../../state/routes";
import type { QueueItem } from "../../components/QueueList/QueueList";

export type QueueTab = "needs" | "incoming" | "verify" | "outgoing";

export interface QueueEntry {
  /** `appt:<id>`, `in:<id>` or `out:<id>`: unique even when one referral is both incoming and outgoing. */
  key: string;
  kind: "appointment" | "referral";
  direction?: "incoming" | "outgoing";
  appointment?: Appointment;
  referral?: Referral;
  patientId: string;
  createdAt: string;
  urgency: "emergency" | "urgent" | "routine";
  escalated: boolean;
  needsYou: boolean;
}

/** An appointment request carries the patient's AI triage level: HIGH sorts as urgent, EMERGENCY as emergency (D-30). */
const levelUrgency = (level: Appointment["triage_level"]): QueueEntry["urgency"] =>
  level === "EMERGENCY" ? "emergency" : level === "HIGH" ? "urgent" : "routine";

const FINISHED = ["CLOSED", "DECLINED", "CANCELLED", "EXPIRED"];
// Appointment states that wait on a clinician's decision. CONFIRMED is visit management, not a decision.
const APPOINTMENT_DECISION = ["REQUESTED", "PATIENT_ACCEPTED"];

/**
 * Turns the three list responses into queue entries. "Needs you" is derived from the same holder map
 * the tracker uses (state/routes.ts), so the queue and the case view cannot disagree about who is holding.
 */
export function buildEntries(appointments: Appointment[], incoming: Referral[], outgoing: Referral[]): QueueEntry[] {
  const entries: QueueEntry[] = appointments.map((a) => ({
    key: `appt:${a.id}`, kind: "appointment", appointment: a, patientId: a.patient_id, createdAt: a.created_at,
    urgency: levelUrgency(a.triage_level), escalated: false, needsYou: APPOINTMENT_DECISION.includes(a.state),
  }));
  const referral = (r: Referral, direction: "incoming" | "outgoing"): QueueEntry => {
    const holder = holderOf("referral", r.state);
    return {
      key: `${direction === "incoming" ? "in" : "out"}:${r.id}`, kind: "referral", direction, referral: r, patientId: r.patient_id,
      createdAt: r.escalated_at ?? r.sent_at ?? r.created_at, urgency: r.urgency, escalated: r.state === "ESCALATED",
      needsYou: holder === (direction === "incoming" ? "receiver" : "sender"),
    };
  };
  return [...entries, ...incoming.map((r) => referral(r, "incoming")), ...outgoing.map((r) => referral(r, "outgoing"))];
}

const open = (e: QueueEntry) => e.kind === "referral" && !FINISHED.includes(e.referral!.state);

export function entriesForTab(entries: QueueEntry[], tab: QueueTab): QueueEntry[] {
  switch (tab) {
    case "needs": return entries.filter((e) => e.needsYou);
    // An incoming referral that is OUTCOME_RETURNED is back with the sender: it is only "open" for the other direction.
    case "incoming": return entries.filter((e) => e.direction === "incoming" && open(e) && holderOf("referral", e.referral!.state) === "receiver");
    case "outgoing": return entries.filter((e) => e.direction === "outgoing" && open(e));
    case "verify": return []; // no list endpoint (MASTERPLAN §8.3 G-1)
  }
}

export function countsByTab(entries: QueueEntry[]): Record<QueueTab, number> {
  return { needs: entriesForTab(entries, "needs").length, incoming: entriesForTab(entries, "incoming").length, verify: 0, outgoing: entriesForTab(entries, "outgoing").length };
}

/** Which tabs this user sees (AUTH_RBAC §5.3). */
export function visibleTabs(me: UserMe | null | undefined): QueueTab[] {
  const clinician = hasRole(me, "clinician");
  const tabs: QueueTab[] = ["needs"];
  if (clinician || can(me, PERMISSIONS.referralAcknowledge)) tabs.push("incoming");
  if (clinician) tabs.push("verify", "outgoing");
  return tabs;
}

/** The patient's full name in both scripts when the record is known, else the referral's given name. */
export function toQueueItem(e: QueueEntry, patients: Map<string, Pick<Patient, "given_name" | "family_name" | "name_bn">>, locale: Locale): QueueItem {
  const p = patients.get(e.patientId);
  const name = p ? [p.given_name, p.family_name].filter(Boolean).join(" ") : e.referral?.patient_name ?? "";
  return {
    id: e.key,
    patientName: name || "…",
    patientNameBn: p?.name_bn || undefined,
    reason: e.referral ? e.referral.reason : `${t(locale, "queue.appointmentRequest")}, ${formatDhakaDateTime(e.appointment!.slot.start, locale)}`,
    urgency: e.urgency,
    escalated: e.escalated,
    escalatedAt: e.referral?.escalated_at ?? undefined,
    createdAt: e.createdAt,
  };
}
