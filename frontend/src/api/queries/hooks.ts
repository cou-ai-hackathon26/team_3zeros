"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RequestOptions } from "../client";
import { queryKeys } from "./index";
import { useApi } from "./provider";
import type { Appointment, ConsentRequest, ConsentsResponse, DirectoryFacilityEntry, DirectoryPractitioner, NotificationItem, Page, QueryFilters, Referral, Slot } from "./types";

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
  useGet<Page<Referral>>(queryKeys.referrals(direction, state), withQuery("/referrals", { direction, state }));
export const useReferral = (id: string) => useGet<Referral>(queryKeys.referral(id), `/referrals/${id}`);

// The backend serves this list at `/consents/` with the trailing slash (audit A-21); next.config keeps the slash.
export const useConsents = () => useGet<ConsentsResponse>(queryKeys.consents, "/consents/?patient=me");
export const useConsentRequest = (id: string) => useGet<ConsentRequest>(queryKeys.consentRequest(id), `/consent-requests/${id}`);
export const useNotifications = () => useGet<Page<NotificationItem>>(queryKeys.notifications, "/notifications");

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
