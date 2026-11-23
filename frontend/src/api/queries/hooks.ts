"use client";

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RequestOptions } from "../client";
import { queryKeys } from "./index";
import { useApi } from "./provider";
import type { AccessRequestItem, ApiExtractedField, Appointment, Chart, DocumentMeta, ExtractionResponse, Patient, TriageSessionDetail, ConsentRequest, ConsentsResponse, DirectoryFacilityEntry, DirectoryPractitioner, NotificationItem, Page, QueryFilters, Referral, Slot } from "./types";
export type { AccessRequestItem } from "./types";

/** Builds `?a=1&b=2`, skipping undefined and empty values. */
export function withQuery(path: string, params?: QueryFilters): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function useGet<T>(key: QueryKey, path: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: key, queryFn: async () => (await api.get<T>(path)).data, enabled });
}

export interface DirectoryArea {
  id: string;
  level: "division" | "district" | "upazila";
  parent_id: string | null;
  name_en: string;
  name_bn: string;
  code: string;
}

/** The directory list endpoints return a bare array today, not the paged envelope in MASTERPLAN §6.1. Accept both. */
export function asList<T>(data: Page<T> | T[] | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results;
}

/** Areas of one level, optionally under a parent (division → district → upazila). */
export function useAreaList(level: DirectoryArea["level"], parent?: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.areas, level, parent ?? ""],
    queryFn: async () => asList((await api.get<Page<DirectoryArea> | DirectoryArea[]>(withQuery("/directory/areas", { level, parent }))).data),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useSpecialties() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.specialties,
    queryFn: async () => asList((await api.get<Page<unknown> | unknown[]>("/directory/specialties")).data),
    staleTime: 10 * 60_000,
  });
}
/** Doctor discovery, loaded a cursor page at a time (`next_cursor`). */
export function usePractitioners(filters?: QueryFilters) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.practitioners(filters as Record<string, string>),
    initialPageParam: "",
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<DirectoryPractitioner>>(withQuery("/directory/practitioners", { ...filters, cursor: pageParam || undefined }))).data,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** Facilities with their latest dated capacity report (INV-14). */
export function useFacilityDirectory() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.facilities(),
    queryFn: async () => asList((await api.get<Page<DirectoryFacilityEntry> | DirectoryFacilityEntry[]>(withQuery("/directory/facilities", { limit: "100" }))).data),
    staleTime: 5 * 60_000,
  });
}

/** Open slots of one practitioner. The endpoint returns a bare array today (audit A-15 family). */
export function usePractitionerSlots(practitionerId: string, facilityId?: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.slots(practitionerId, facilityId),
    queryFn: async () => asList((await api.get<Page<Slot> | Slot[]>(withQuery(`/practitioners/${practitionerId}/slots`, { facility: facilityId }))).data),
    enabled,
    staleTime: 0,
  });
}

export const useAppointments = (filters?: QueryFilters) =>
  useGet<Page<Appointment>>(queryKeys.appointments(filters as Record<string, string>), withQuery("/appointments", filters));
export const useAppointment = (id: string) => useGet<Appointment>(queryKeys.appointment(id), `/appointments/${id}`);

export const useReferrals = (direction?: "incoming" | "outgoing", state?: string) =>
  useGet<Page<Referral>>(queryKeys.referrals(direction, state), withQuery("/referrals/", { direction, state, limit: "100" }));
export const useReferral = (id: string) => useGet<Referral>(queryKeys.referral(id), `/referrals/${id}`);

// Collection roots (`/consents/`, `/referrals/`, `/patients/`, `/documents/`, `/notifications/`) are served with a trailing
// slash (audit A-21). Django cannot redirect a POST, so the slash must be in the request; next.config keeps it.
export const useConsents = () => useGet<ConsentsResponse>(queryKeys.consents, "/consents/?patient=me");
export const useConsentRequest = (id: string) => useGet<ConsentRequest>(queryKeys.consentRequest(id), `/consent-requests/${id}`);
export const useNotifications = () => useGet<Page<NotificationItem>>(queryKeys.notifications, "/notifications/");

export function useMarkNotificationRead() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<unknown>(`/notifications/${id}/read`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export interface TransitionVariables {
  id: string;
  action: string;
  /** Object version, sent as If-Match. */
  version: number;
  /** One key per button press (createIntentIdempotencyKey), reused if the request is retried. */
  idempotencyKey: string;
  body?: Record<string, unknown>;
}

/**
 * POST /{entity}/{id}/actions/{action} (MASTERPLAN §6.3). The server decides
 * whether the action is allowed; the UI only offers `allowed_actions`.
 * A 202 means the transition is pending a FHIR write: callers must not show it as done.
 */
export function useTransition(entity: "appointments" | "referrals") {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TransitionVariables) => {
      const opts: RequestOptions = { body: v.body ?? {}, idempotencyKey: v.idempotencyKey, expectedVersion: v.version };
      const res = await api.post<Appointment | Referral>(`/${entity}/${v.id}/actions/${v.action}`, opts);
      return { object: res.data, pending: res.status === 202 };
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: [entity === "appointments" ? "scheduling" : "referrals"] });
      qc.invalidateQueries({ queryKey: entity === "appointments" ? queryKeys.appointment(v.id) : queryKeys.referral(v.id) });
    },
  });
}


/** Patient asks for a slot (`POST /appointments`). A `409 slot_unavailable` means someone else took it: the caller refetches slots. */
export function useRequestAppointment() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { slotId: string; triageSessionId?: string; idempotencyKey: string }) =>
      (await api.post<Appointment>("/appointments", { body: { slot_id: v.slotId, ...(v.triageSessionId ? { triage_session_id: v.triageSessionId } : {}) }, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduling"] }),
  });
}

/** Patient decision on a consent request, and revocation of an active consent. Equal weight: INV-10. */
export function useConsentAction() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: "grant" | "refuse" | "revoke"; id: string; idempotencyKey: string }) => {
      const path = v.kind === "revoke" ? `/consents/${v.id}/revoke` : `/consent-requests/${v.id}/${v.kind}`;
      return (await api.post<unknown>(path, { body: {}, idempotencyKey: v.idempotencyKey })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consents"] }),
  });
}


// ---- Clinical ----

export const usePatient = (id: string, enabled = true) => useGet<Patient>(["records", "patient", id], `/patients/${id}`, enabled);
export const useChart = (id: string) => useGet<Chart>(queryKeys.patientChart(id), `/patients/${id}/chart`);

/** Names for the queue rows, fetched in parallel for the patients the user can see. Missing names stay undefined. */
export function usePatientNames(ids: string[]): Map<string, Patient> {
  const api = useApi();
  const unique = [...new Set(ids)];
  const results = useQueries({
    queries: unique.map((id) => ({ queryKey: ["records", "patient", id], queryFn: async () => (await api.get<Patient>(`/patients/${id}`)).data, staleTime: 5 * 60_000, retry: false })),
  });
  const map = new Map<string, Patient>();
  results.forEach((r, i) => r.data && map.set(unique[i], r.data));
  return map;
}

/** `GET /patients/?q=`. The backend serves this list with a trailing slash (audit A-21). */
export function usePatientSearch(q: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["records", "search", q],
    queryFn: async () => asList((await api.get<Page<Patient> | Patient[]>(withQuery("/patients/", { q }))).data),
    enabled: q.trim().length > 0,
  });
}

export const useTriageSession = (id: string | null | undefined) => useGet<TriageSessionDetail>(queryKeys.triageSession(id ?? ""), `/triage/sessions/${id}`, !!id);

const PROCESSING = ["UPLOADED", "OCR_QUEUED", "OCR_RUNNING"];

/** Document metadata; polls every 3 seconds while OCR is still running. */
export function useDocument(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.document(id),
    queryFn: async () => (await api.get<DocumentMeta>(`/documents/${id}`)).data,
    refetchInterval: (q) => (q.state.data && PROCESSING.includes(q.state.data.state) ? 3000 : false),
  });
}

export function useExtraction(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.documentExtraction(id),
    queryFn: async () => (await api.get<ExtractionResponse>(`/documents/${id}/extraction`)).data,
    enabled,
  });
}

/** Verify, reject or retry OCR. Verification is FHIR-gated: a 202 means "saving", never "done" (INV-12). */
export function useDocumentAction(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: "verify" | "reject" | "retry_ocr"; fields?: ApiExtractedField[]; idempotencyKey: string }) => {
      const path = v.kind === "retry_ocr" ? `/documents/${id}/actions/retry_ocr` : `/documents/${id}/extraction/${v.kind}`;
      const res = await api.post<unknown>(path, { body: v.kind === "verify" ? { fields: v.fields } : {}, idempotencyKey: v.idempotencyKey });
      return { pending: res.status === 202 };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export interface NewReferral {
  patient_id: string;
  receiver_facility_id: string;
  urgency: "routine" | "urgent" | "emergency";
  reason: string;
  encounter_id?: string;
}

export function useCreateReferral() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { body: NewReferral; idempotencyKey: string }) => (await api.post<Referral>("/referrals/", { body: v.body, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals"] }),
  });
}

/** Edit draft content (DRAFT only) and ask the server to queue an AI draft summary. */
export function useReferralDraft(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["referrals"] });
  const save = useMutation({
    mutationFn: async (v: { reason?: string; urgency?: string; summary?: Record<string, unknown>; version: number }) =>
      (await api.patch<Referral>(`/referrals/${id}`, { body: { reason: v.reason, urgency: v.urgency, summary: v.summary }, expectedVersion: v.version })).data,
    onSuccess: done,
  });
  const generate = useMutation({
    mutationFn: async (idempotencyKey: string) => (await api.post<unknown>(`/referrals/${id}/generate-draft`, { body: {}, idempotencyKey })).data,
    onSuccess: done,
  });
  return { save, generate };
}

export function useCreateEncounter(patientId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { body: { facility_id: string; period_start: string; reason?: string; encounter_type?: string }; idempotencyKey: string }) =>
      (await api.post<unknown>(`/patients/${patientId}/encounters`, { body: v.body, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patientChart(patientId) }),
  });
}


export interface PriorResult { id: string; code: string; display_name: string; value: string; unit: string; observed_date: string | null; lab: string }
export interface DuplicateCandidate { id: string; patient_a_id: string; patient_b_id: string; score: number; reasons: unknown; status: string }

/** Earlier verified results with date and lab (INV-15). */
export function usePriorResults(patientId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.patientResults(patientId),
    queryFn: async () => (await api.get<{ results: PriorResult[] }>(`/patients/${patientId}/results`)).data.results,
  });
}

export function useDuplicateCandidates(patientId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["records", "duplicates", patientId],
    queryFn: async () => asList((await api.get<Page<DuplicateCandidate> | DuplicateCandidate[]>(`/patients/${patientId}/duplicate-candidates`)).data).filter((c) => c.status === "open"),
  });
}

/** A human decision on a possible duplicate. Nothing merges automatically, and the browser never picks (INV-13). */
export function useResolveDuplicate(patientId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { candidateId: string; status: "same_person" | "different"; idempotencyKey: string }) =>
      (await api.post<unknown>(`/patients/${patientId}/duplicate-candidates/${v.candidateId}/resolve`, { body: { status: v.status }, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["records"] }),
  });
}

/** Report upload (multipart). The server starts OCR; the verify page polls the document. */
export function useUploadDocument() {
  const api = useApi();
  return useMutation({
    mutationFn: async (v: { patientId: string; file: File; encounterId?: string; idempotencyKey: string }) => {
      const form = new FormData();
      form.set("patient_id", v.patientId);
      form.set("file", v.file);
      if (v.encounterId) form.set("encounter_id", v.encounterId);
      return (await api.post<DocumentMeta>("/documents/", { body: form, idempotencyKey: v.idempotencyKey })).data;
    },
  });
}

// ---- Administration (Phase 7 / G-5) ----

export interface AdminFacility {
  id: string;
  name: string;
  name_bn: string;
  type: string;
  address?: string;
  phone?: string;
  area?: { id: string; name_en: string; name_bn: string } | null;
  departments?: { id: string; name: string; name_bn: string }[];
}

export interface AdminSchedule {
  id: string;
  practitioner_id: string;
  practitioner_name: string;
  specialty: string;
  facility_id: string;
  facility_name: string;
  slots_count: number;
  recurrence_rules?: Record<string, unknown>;
}

export interface AdminCapacityReport {
  id: string;
  facility: string;
  facility_name?: string;
  reported_at: string;
  service_capacities?: Record<string, unknown>;
  general_medicine_beds?: number;
  emergency_status?: string;
}

export interface AdminStaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  facility_id: string;
  facility_name: string;
  role: string;
  permissions: string[];
  username?: string | null;
  active?: boolean;
  mfa_enabled?: boolean;
  active_from: string | null;
  active_to: string | null;
}

export const useAdminFacilities = () =>
  useGet<Page<AdminFacility> | AdminFacility[]>(queryKeys.adminFacilities, "/admin/facilities");

export const useAdminSchedules = () =>
  useGet<Page<AdminSchedule> | AdminSchedule[]>(queryKeys.adminSchedules, "/admin/schedules");

export const useAdminCapacityReports = () =>
  useGet<Page<AdminCapacityReport> | AdminCapacityReport[]>(queryKeys.adminCapacityReports, "/admin/capacity-reports");

export const useAdminStaff = () =>
  useGet<Page<AdminStaffMember> | AdminStaffMember[]>(queryKeys.adminStaff, "/admin/staff");

export const useAdminAccessRequests = (status?: string) =>
  useGet<Page<AccessRequestItem> | AccessRequestItem[]>(
    queryKeys.adminAccessRequests(status),
    status ? `/admin/access-requests?status=${status}` : "/admin/access-requests"
  );

export function useAccessRequestActions() {
  const api = useApi();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "accessRequests"] });
    qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
    qc.invalidateQueries({ queryKey: queryKeys.adminFacilities });
  };
  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ status: string; facility_id: string; reference: string; details?: { temporary_password?: string; totp_uri?: string } }>(
        `/admin/access-requests/${id}/approve`,
        { body: {} }
      )).data,
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post<{ status: string; reference: string; reason: string }>(
        `/admin/access-requests/${id}/reject`,
        { body: { reason } }
      )).data,
    onSuccess: invalidate,
  });
  return { approve, reject };
}


// ---- Admin access control (MASTERPLAN D-16) ----

export interface PermissionEntry { code: string; description: string }
export const usePermissionCatalogue = () => useGet<Page<PermissionEntry>>(["admin", "permissions"], "/admin/permissions");

export interface NewStaff {
  display_name: string;
  email?: string;
  username?: string;
  role: "clinician" | "facility_staff" | "facility_admin";
  facility_id: string;
  permissions: string[];
  registration_number?: string;
}
/** Returned once by create, reset-password and reset-mfa. They are never stored or fetched again. */
export interface OneTimeSecrets { temporary_password?: string; totp_uri?: string }

export function useStaffAccess() {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
  const create = useMutation({
    mutationFn: async (v: { body: NewStaff; idempotencyKey: string }) =>
      (await api.post<AdminStaffMember & OneTimeSecrets>("/admin/staff", { body: v.body, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; role?: string; permissions?: string[] }) =>
      (await api.patch<AdminStaffMember>(`/admin/staff/${v.id}`, { body: { role: v.role, permissions: v.permissions } })).data,
    onSuccess: done,
  });
  const action = useMutation({
    mutationFn: async (v: { id: string; kind: "deactivate" | "reactivate" | "reset-password" | "reset-mfa" | "revoke-sessions"; idempotencyKey: string }) =>
      (await api.post<OneTimeSecrets & Partial<AdminStaffMember>>(`/admin/staff/${v.id}/${v.kind}`, { body: {}, idempotencyKey: v.idempotencyKey })).data,
    onSuccess: done,
  });
  return { create, update, action };
}
