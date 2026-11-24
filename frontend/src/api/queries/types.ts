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
  /** AI triage level snapshot taken when the request was made (D-30). An AI draft; null = not assessed. */
  triage_level?: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY" | null;
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
  type?: string;
  area_name?: string | null;
  area_name_bn?: string | null;
  address?: string;
  phone?: string;
  services?: { id: string; code: string; name: string; name_bn?: string }[];
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
  patient_system_id?: string | null;
  patient_has_account?: boolean;
  initiated_by_id?: string | null;
  consent_request_id?: string | null;
  is_partial?: boolean;
  completeness_status?: string;
  missing_fields?: string[];
  reconciled_at?: string | null;
  reconciliation_metadata?: Record<string, unknown>;
  sender_facility_id: string;
  sender_facility_name: string;
  sender_practitioner_name?: string | null;
  receiver_facility_id: string;
  receiver_facility_name: string;
  receiver_practitioner_id?: string | null;
  /** Draft summary: sections of statements, each with source references (ai/adapters.py). */
  summary: { sections?: { name: string; statements: { text: string; source_refs: string[] }[] }[]; [k: string]: unknown };
  report_history?: PatientReportHistory | null;
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
  system_id?: string | null;
  has_account?: boolean;
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

export interface ActiveAllergy {
  id: string;
  name: string;
  reaction: string;
  observed_date?: string | null;
}

export interface ActiveMedication {
  id: string;
  name: string;
  dosage: string;
  observed_date?: string | null;
}

export interface ActiveProblem {
  encounter_id: string;
  reason: string;
  period_start: string;
}

export interface Chart {
  patient_id: string;
  encounters: Encounter[];
  active_allergies?: ActiveAllergy[];
  active_medications?: ActiveMedication[];
  active_problems?: ActiveProblem[];
  documents?: DocumentMeta[];
  report_history?: PatientReportHistory | null;
}

export interface DocumentDownloadLinkResponse {
  document_id: string;
  url: string;
  expires_at: string;
}

export type FieldInterpretation = "normal" | "abnormal" | "positive" | "negative" | "high" | "low" | "unknown";

export interface DocumentAiFinding {
  test: string;
  value: string;
  status: FieldInterpretation | string;
  reference_range?: string;
  lab?: string;
}

export interface DocumentAiReport {
  summary: string;
  tests_performed: string[];
  positive_or_abnormal_findings: DocumentAiFinding[];
  negative_or_normal_findings: DocumentAiFinding[];
  rag_references: Array<{ document: string; page: number | null; relevant_information: string }>;
  questions_for_doctor: string[];
  missing_information: string[];
  requires_clinician_review: boolean;
  verified: boolean;
  disclaimer: string;
}

export interface ReportHistoryFinding {
  name: string;
  value: string;
  unit: string;
  reference_range?: string;
  interpretation: FieldInterpretation | string;
  lab?: string;
  date?: string | null;
  document_id: string;
  filename: string;
  page: number;
  verified: boolean;
}

export interface PatientReportHistory {
  reports_count: number;
  verified_reports_count: number;
  concise_summary: string;
  positive_or_abnormal: ReportHistoryFinding[];
  negative_or_normal: ReportHistoryFinding[];
  tests_performed: ReportHistoryFinding[];
  documents: Array<{
    id: string;
    filename: string;
    state: string;
    verified: boolean;
    uploaded_at: string | null;
    summary: string;
    fields_count: number;
  }>;
  disclaimer: string;
}

export interface DocumentMeta {
  id: string;
  patient_id: string;
  original_filename: string;
  content_type: string;
  size: number;
  state: string;
  ai_report?: DocumentAiReport | null;
  fields_count?: number;
  positive_count?: number;
  uploaded_by_role?: "patient" | "clinician" | "system" | string;
  created_at: string;
}

export interface ApiExtractedField {
  id: string;
  name: string;
  value: string;
  unit: string;
  reference_range?: string;
  interpretation?: FieldInterpretation | string;
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
  raw_text?: string;
  ai_report?: DocumentAiReport | null;
}

/** `POST /triage/sessions/{id}/turns` reply: the assistant turn plus the session state, so the client knows when the interview closed. */
export interface TriageTurnReply extends TriageTurn {
  session_state?: string;
}

export interface TriageTurn {
  id: string;
  role: "patient" | "assistant" | "system";
  text: string;
  language_detected: string;
  red_flag_hits?: Array<{ rule_id: string; symptom: string; matched_keyword?: string }>;
  response_policy?: "grounded" | "declined" | "emergency" | "question" | string;
  at: string;
}

export interface TriageGuidanceSource {
  title: string;
  publisher?: string;
  version?: string;
}

/** AI consultation report stored by the backend at finish (D-25). A draft for the patient; never a diagnosis. */
export interface ConsultationReport {
  conversation_summary: {
    overview: string;
    missing_information: string[];
    [k: string]: unknown;
  };
  health_assessment: {
    primary_concern: string;
    possible_explanations: Array<{ text: string; document: string; page: number | null }>;
    triage_level: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
    triage_reasoning: string;
    medical_evidence: Array<{ document: string; page: number | null; relevant_information: string }>;
    recommended_actions: string[];
    warning_signs: string[];
    recommended_specialization: string | null;
    follow_up_guidance: string;
    emergency_instructions: string | null;
    missing_information: string[];
    requires_clinician_review: boolean;
    disclaimer: string;
    [k: string]: unknown;
  };
}

export interface TriageSummaryData {
  patient_words?: string;
  structured_fields?: {
    chief_complaint?: string;
    duration?: string;
    severity?: string;
    additional_notes?: string;
    red_flag_check?: string;
    suggested_specialty_code?: string;
    suggested_specialty_en?: string;
    suggested_specialty_bn?: string;
    guidance_sources?: TriageGuidanceSource[];
    report?: ConsultationReport;
    /** pending while the report is being drafted in the background, then ready or unavailable (D-27). */
    report_status?: "pending" | "ready" | "unavailable";
    triage_level?: "LOW" | "MODERATE" | "HIGH" | "EMERGENCY" | null;
    [k: string]: unknown;
  };
  guidance_given?: string | unknown[];
  patient_confirmed_at?: string | null;
  patient_edits?: Record<string, string>;
}

export interface TriageSessionDetail {
  id: string;
  state: string;
  allowed_actions?: string[];
  version?: number;
  language?: "bn" | "en" | string;
  mode?: "voice" | "text" | string;
  triage_disclosure_version?: string;
  ruleset_version?: string;
  /** Interview length: aim for `target` answers, never more than `max` (D-27). */
  interview?: { target: number; max: number };
  turns?: TriageTurn[];
  summary?: TriageSummaryData | null;
  started_at?: string;
  ended_at?: string | null;
}

/** `POST /triage/sessions/{id}/translate` (D-22). `text` is null when translation is unavailable. */
export interface CaptionTranslation {
  text: string | null;
  lang: "bn" | "en";
  machine: true;
}

export interface VoiceCredentialsResponse {
  session_ref: string;
  provider: string;
  token: string;
  expires_at: string;
  assistant_id?: string;
  status?: "placeholder" | "ready" | string;
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

export interface AccessRequestItem {
  id: string;
  name: string;
  bmdc_registration_number: string;
  contact: string;
  facility_id?: string | null;
  facility_name?: string | null;
  facility_name_bn?: string | null;
  chamber_name?: string | null;
  chamber_name_bn?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface ClinicalObservationItem {
  code: string;
  display_name: string;
  value_string?: string;
  value_numeric?: number | null;
  unit?: string;
  observed_date?: string | null;
}

export interface EDVisitItem {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_name_bn?: string;
  patient_id: string;
  patient_name: string;
  patient_name_bn?: string;
  patient_phone?: string;
  patient_sex?: string;
  encounter_id?: string | null;
  state: "ARRIVED" | "TRIAGED" | "UNDER_CARE" | "ADMITTED" | "DISCHARGED" | "TRANSFERRED" | "LEFT" | "DIED";
  triage_category?: "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE" | null;
  chief_complaint: string;
  arrival_mode: "AMBULANCE" | "WALK_IN" | "POLICE" | "REFERRAL" | "OTHER";
  arrived_at: string;
  triaged_at?: string | null;
  triaged_by_name?: string | null;
  disposition_at?: string | null;
  disposition_notes?: string;
  discharge_summary?: string;
  transfer_facility_id?: string | null;
  transfer_facility_name?: string | null;
  observations: ClinicalObservationItem[];
  version: number;
  allowed_actions: string[];
  created_at: string;
}

export interface NewEDVisit {
  facility_id?: string;
  patient_id?: string;
  patient_name?: string;
  patient_name_bn?: string;
  patient_phone?: string;
  patient_sex?: "male" | "female" | "other" | "unknown";
  chief_complaint: string;
  arrival_mode?: "AMBULANCE" | "WALK_IN" | "POLICE" | "REFERRAL" | "OTHER";
  vitals?: Record<string, string | number>;
  notes?: string;
}

export interface ClinicalOrderItem {
  id: string;
  encounter_id: string;
  patient_id: string;
  test_name: string;
  code: string;
  notes: string;
  priority: "ROUTINE" | "URGENT" | "STAT";
  status: "PLACED" | "COMPLETED" | "CANCELLED";
  ordered_by_name: string | null;
  created_at: string;
}

export interface NewClinicalOrder {
  test_name: string;
  code?: string;
  notes?: string;
  priority?: "ROUTINE" | "URGENT" | "STAT";
}

export interface OrderRecentResultItem {
  id: string;
  test_name: string;
  code: string;
  value: string;
  unit: string;
  observed_date: string;
  days_ago: number;
  facility_name: string;
  verified: boolean;
}

export interface OrderCreateResponse {
  order: ClinicalOrderItem;
  recent_results: OrderRecentResultItem[];
  advisory: string | null;
}

export interface TestResultTimelineItem {
  id: string;
  code: string;
  display_name: string;
  value: string;
  unit: string;
  observed_date: string | null;
  lab: string;
  verified: boolean;
}

export interface TestTimelineGroup {
  test_name: string;
  code: string;
  results: TestResultTimelineItem[];
}

export interface PatientResultsResponse {
  patient_id: string;
  results: TestResultTimelineItem[];
  timeline: TestTimelineGroup[];
}

export type QueryFilters = Record<string, string | undefined>;
