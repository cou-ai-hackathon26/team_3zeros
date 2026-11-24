/**
 * Phase 3C / 3C.2: HTTP transport adapter bridging UnifiedOfflineQueueStore to Medi Waypoint's API client.
 *
 * Maps each OfflineItemKind to its canonical backend endpoint while preserving:
 * - Stable Idempotency-Key header (reused across all retries)
 * - Optional If-Match expected_version header on referral actions
 * - Provisional code & idempotency_key fields for Phase 3A/3B idempotency and partial-intake reconciliation
 * - Single-attempt CSRF refresh via GET /auth/me (F-4) mirroring useAuth().post, transitioning to
 *   AUTH_REQUIRED if the session itself has expired
 * - Clean separation between ApiError (classified by HTTP status/code) and network errors (thrown for backoff)
 */

import { ApiError, type createApiClient } from "../api/client";
import type { EmergencyMinimumPayload } from "./queue";
import type {
  DecryptedUnifiedItem,
  OfflinePatientPayload,
  OfflineReferralActionPayload,
  OfflineStandardReferralPayload,
  UnifiedTransportFn,
  UnifiedTransportResponse,
} from "./unifiedQueue";

export type ApiClientLike = Pick<ReturnType<typeof createApiClient>, "get" | "post">;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isCsrfFailure(err: ApiError): boolean {
  return (
    err.code === "csrf_failed" ||
    (err.status === 403 && /^CSRF Failed/i.test(err.message))
  );
}

async function sendItemOnce(
  api: ApiClientLike,
  item: DecryptedUnifiedItem
): Promise<UnifiedTransportResponse> {
  if (item.kind === "patient_create") {
    const payload = item.payload as OfflinePatientPayload;
    const res = await api.post<Record<string, unknown>>("/patients/", {
      idempotencyKey: item.idempotencyKey,
      body: payload,
    });
    return { status: res.status, body: asRecord(res.data) };
  }

  if (item.kind === "standard_referral") {
    const payload = item.payload as OfflineStandardReferralPayload;
    const res = await api.post<Record<string, unknown>>("/referrals/", {
      idempotencyKey: item.idempotencyKey,
      body: {
        ...payload,
        provisional_code: item.provisionalCode ?? undefined,
        idempotency_key: item.idempotencyKey,
      },
    });
    return { status: res.status, body: asRecord(res.data) };
  }

  if (item.kind === "emergency_referral") {
    const payload = item.payload as EmergencyMinimumPayload;
    if (!payload.receiver_facility_id) {
      return {
        status: 400,
        body: { error: { code: "validation_error", message: "receiver_missing" } },
        errorCode: "validation_error",
      };
    }
    const res = await api.post<Record<string, unknown>>("/referrals/emergency", {
      idempotencyKey: item.idempotencyKey,
      body: {
        patient_id: payload.patient_id ?? undefined,
        unverified_description: payload.unverified_description,
        reason: payload.reason,
        urgency: payload.urgency,
        vitals: payload.vitals,
        treatment_given: payload.treatment_given,
        facility_id: payload.receiver_facility_id,
        provisional_code: item.provisionalCode ?? undefined,
        idempotency_key: item.idempotencyKey,
        created_at_device: item.createdAtDevice,
      },
    });
    return { status: res.status, body: asRecord(res.data) };
  }

  if (item.kind === "referral_action") {
    const payload = item.payload as OfflineReferralActionPayload;
    const res = await api.post<Record<string, unknown>>(
      `/referrals/${encodeURIComponent(payload.referral_id)}/actions/${encodeURIComponent(payload.action)}`,
      {
        idempotencyKey: item.idempotencyKey,
        expectedVersion: payload.expected_version ?? undefined,
        body: payload.body ?? {},
      }
    );
    return { status: res.status, body: asRecord(res.data) };
  }

  return {
    status: 400,
    body: {},
    errorCode: "validation_error",
  };
}

export function createUnifiedSyncTransport(api: ApiClientLike): UnifiedTransportFn {
  return async (item: DecryptedUnifiedItem): Promise<UnifiedTransportResponse> => {
    if (!item.payload) {
      return {
        status: 500,
        body: {},
        errorCode: "decryption_key_unavailable",
      };
    }

    try {
      return await sendItemOnce(api, item);
    } catch (err) {
      if (err instanceof ApiError) {
        // F-4: Django reports expired/stale CSRF cookies as 403 ("CSRF Failed") or csrf_failed.
        // Mirror useAuth().post: refresh CSRF cookie via GET /auth/me once, then retry with the same Idempotency-Key.
        if (isCsrfFailure(err)) {
          try {
            await api.get("/auth/me");
          } catch (meErr) {
            if (
              meErr instanceof ApiError &&
              (meErr.status === 401 || meErr.code === "not_authenticated" || meErr.code === "mfa_required")
            ) {
              return {
                status: 401,
                body: asRecord(meErr.rawBody),
                errorCode: "not_authenticated",
              };
            }
            // Network error during /auth/me propagates for backoff retry
            if (!(meErr instanceof ApiError)) {
              throw meErr;
            }
            return {
              status: err.status,
              body: asRecord(err.rawBody),
              errorCode: "csrf_failed",
            };
          }

          // Retry the exact same request once with the refreshed CSRF cookie and original Idempotency-Key
          try {
            return await sendItemOnce(api, item);
          } catch (retryErr) {
            if (retryErr instanceof ApiError) {
              return {
                status: retryErr.status,
                body: asRecord(retryErr.rawBody),
                errorCode: isCsrfFailure(retryErr) ? "csrf_failed" : retryErr.code,
              };
            }
            throw retryErr;
          }
        }

        return {
          status: err.status,
          body: asRecord(err.rawBody),
          errorCode: err.code,
        };
      }
      // Network exceptions propagate so UnifiedOfflineQueueStore classifies as network_unavailable + backoff.
      throw err;
    }
  };
}
