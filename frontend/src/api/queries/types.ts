/** Minimum shapes from MASTERPLAN §7. The OpenAPI schema stays authoritative for full detail. */

export interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

export interface Stateful {
  id: string;
  state: string;
  allowed_actions: string[];
  version: number;
  created_at: string;
  updated_at: string;
  fhir_sync_status?: string;
  pending_action?: string;
  pending_since?: string;
}

export interface SlotRef {
  id: string;
  start: string;
  end: string;
}

export interface HistoryEntry {
  action: string;
  from_state: string;
  to_state: string;
  actor: { id: string; name: string; role: string };
  at: string;
  reason?: string;
}

export interface Appointment extends Stateful {
  patient: unknown;
  practitioner: unknown;
  facility: unknown;
  slot: SlotRef;
  original_slot?: SlotRef;
  triage_session_id?: string;
  decline_reason?: string;
  expires_at: string;
  history: HistoryEntry[];
}

export interface Referral extends Stateful {
  patient: unknown;
  encounter: unknown;
  sender: unknown;
  receiver: unknown;
  urgency: "routine" | "urgent" | "emergency";
  emergency_mode: boolean;
  reason: string;
  consent_state: string;
  reference_code: string;
  history: HistoryEntry[];
}

export interface ConsentRequest {
  id: string;
  referral: unknown;
  recipient: unknown;
  purpose: string;
  categories: string[];
  content_hash: string;
  state: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  [field: string]: unknown;
}

export type QueryFilters = Record<string, string | undefined>;
