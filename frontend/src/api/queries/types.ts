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

/**
 * What the backend returns today (scheduling/serializers.py). MASTERPLAN §7 shows nested
 * `practitioner` and `facility` objects; the API returns flat ids and names (audit A-18).
 */
export interface Appointment extends Stateful {
  patient_id: string;
  practitioner_id: string;
  practitioner_name: string;
  facility_id: string;
  facility_name: string;
  slot: SlotRef & { state?: string };
  original_slot?: (SlotRef & { state?: string }) | null;
  triage_session_id?: string | null;
  decline_reason?: string;
  expires_at?: string | null;
  history: HistoryEntry[];
}

export interface Slot extends SlotRef {
  state: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
}

export interface DirectoryPractitioner {
  id: string;
  registration_number: string;
  name: string;
  name_bn?: string;
  specialties: { id: string; code: string; name_en: string; name_bn: string }[];
  facilities: { id: string; name: string; name_bn?: string; type: string }[];
}

export interface FacilityCapacity {
  reported_value: unknown;
  reported_at: string;
  source: string;
  is_stale: boolean;
}

export interface DirectoryFacilityEntry {
  id: string;
  name: string;
  name_bn?: string;
  area_name?: string | null;
  area_name_bn?: string | null;
  latest_capacity: FacilityCapacity | null;
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

/** Consent request as returned by `GET /consent-requests/{id}`. Wording comes from the backend, not message files. */
export interface ConsentRequest {
  id: string;
  patient_id: string;
  recipient_facility_id: string;
  recipient_facility_name: string;
  recipient_practitioner_name: string | null;
  purpose: string;
  categories: string[];
  content_hash: string;
  state: "PENDING" | "GRANTED" | "REFUSED" | "EXPIRED" | "SUPERSEDED" | string;
  expires_at?: string | null;
  created_at: string;
}

export interface ConsentRecord {
  id: string;
  patient_id: string;
  recipient_facility_id: string;
  recipient_facility_name: string;
  purpose: string;
  categories: string[];
  content_hash: string;
  method: string;
  state: "ACTIVE" | "REVOKED" | "EXPIRED" | string;
  revoked_at: string | null;
  created_at: string;
}

/** `GET /consents?patient=me` returns this object, not the paged envelope in MASTERPLAN §6.1 (audit A-19). */
export interface ConsentsResponse {
  consents: ConsentRecord[];
  pending_requests: ConsentRequest[];
}

export interface NotificationItem {
  id: string;
  [field: string]: unknown;
}

export type QueryFilters = Record<string, string | undefined>;
