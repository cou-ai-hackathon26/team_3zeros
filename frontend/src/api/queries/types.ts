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

/**
 * Referral as the backend returns it (referrals/serializers.py). Flat ids and names, unlike the
 * nested objects in MASTERPLAN §7 (audit A-18). `patient_name` is the given name only (audit A-23).
 */
export interface Referral extends Stateful {
  reference_code: string;
  provisional_code?: string | null;
  urgency: "routine" | "urgent" | "emergency";
  emergency_mode: boolean;
  reason: string;
  patient_id: string;
  patient_name: string;
  sender_facility_id: string;
  sender_facility_name: string;
  sender_practitioner_name?: string | null;
  receiver_facility_id: string;
  receiver_facility_name: string;
  receiver_practitioner_id?: string | null;
  /** Draft summary: sections of statements, each with source references (ai/adapters.py). */
  summary: { sections?: { name: string; statements: { text: string; source_refs: string[] }[] }[]; [k: string]: unknown };
  summary_origin?: string;
  content_hash?: string;
  consent_state: string;
  outcome?: Record<string, unknown>;
  decline_reason?: string;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  escalated_at?: string | null;
  history: HistoryEntry[];
}

export interface Patient {
  id: string;
  given_name: string;
  family_name?: string;
  name_bn?: string;
  birth_date?: string | null;
  estimated_age?: number | null;
  sex: string;
  phone?: string;
  area_id?: string | null;
  identifiers: { id: string; system: string; value: string; verified: boolean }[];
  version: number;
}

export interface Observation {
  id: string;
  code: string;
  display_name: string;
  value_string?: string;
  value_numeric?: number | null;
  unit?: string;
  observed_date?: string | null;
}

export interface Encounter {
  id: string;
  patient_id: string;
  facility_id: string;
  facility_name: string;
  practitioner_name?: string | null;
  period_start: string;
  period_end?: string | null;
  encounter_type: string;
  reason?: string;
  observations: Observation[];
  fhir_sync_status?: string;
}

export interface Chart {
  patient_id: string;
  encounters: Encounter[];
}

export interface DocumentMeta {
  id: string;
  patient_id: string;
  original_filename: string;
  content_type: string;
  size: number;
  state: string;
  created_at: string;
}

export interface ApiExtractedField {
  id: string;
  name: string;
  value: string;
  unit: string;
  observed_date: string;
  lab: string;
  confidence: number;
  page: number;
  bbox: [number, number, number, number];
  status?: string;
}

export interface ExtractionResponse {
  document_id: string;
  state: string;
  fields: ApiExtractedField[];
}

export interface TriageSessionDetail {
  id: string;
  state: string;
  language?: string;
  mode?: string;
  summary?: { patient_words?: string; structured_fields?: Record<string, unknown>; guidance_given?: unknown[] } | null;
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
  type?: string;
  title: string;
  body: string;
  object_ref?: string | null;
  channel?: "in_app" | "sms" | "email" | string;
  state?: "PENDING" | "SENT" | "READ" | string;
  sent_at?: string | null;
  read_at?: string | null;
  created_at: string;
  [field: string]: unknown;
}

export type QueryFilters = Record<string, string | undefined>;
