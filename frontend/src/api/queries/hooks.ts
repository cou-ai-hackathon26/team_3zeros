"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RequestOptions } from "../client";
import { queryKeys } from "./index";
import { useApi } from "./provider";
import type { Appointment, ConsentRequest, NotificationItem, Page, QueryFilters, Referral } from "./types";

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

export const useAreas = () => useGet<Page<unknown>>(queryKeys.areas, "/directory/areas");
export const useSpecialties = () => useGet<Page<unknown>>(queryKeys.specialties, "/directory/specialties");
export const usePractitioners = (filters?: QueryFilters) =>
  useGet<Page<unknown>>(queryKeys.practitioners(filters as Record<string, string>), withQuery("/directory/practitioners", filters));
export const usePractitionerSlots = (practitionerId: string, facilityId?: string, enabled = true) =>
  useGet<Page<unknown>>(
    queryKeys.slots(practitionerId, facilityId),
    withQuery(`/practitioners/${practitionerId}/slots`, { facility: facilityId }),
    enabled,
  );

export const useAppointments = (filters?: QueryFilters) =>
  useGet<Page<Appointment>>(queryKeys.appointments(filters as Record<string, string>), withQuery("/appointments", filters));
export const useAppointment = (id: string) => useGet<Appointment>(queryKeys.appointment(id), `/appointments/${id}`);

export const useReferrals = (direction?: "incoming" | "outgoing", state?: string) =>
  useGet<Page<Referral>>(queryKeys.referrals(direction, state), withQuery("/referrals", { direction, state }));
export const useReferral = (id: string) => useGet<Referral>(queryKeys.referral(id), `/referrals/${id}`);

export const useConsents = () => useGet<Page<unknown>>(queryKeys.consents, "/consents?patient=me");
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
