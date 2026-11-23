"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, createIntentIdempotencyKey } from "../api/client";
import { queryKeys } from "../api/queries";
import { useApi } from "../api/queries/provider";
import { normalizeDigits } from "../i18n/format";
import type { UserMe } from "./types";

/**
 * Session state: `GET /auth/me` once, cached under queryKeys.me.
 * `me` is `undefined` while loading, `null` when signed out, otherwise the user.
 * A 401 here means "signed out", so public pages render normally.
 */
export function useMe() {
  const api = useApi();
  const q = useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<UserMe | null> => {
      try {
        return (await api.get<UserMe>("/auth/me")).data;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === "not_authenticated")) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
  return { me: q.data, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch };
}

/** Deletes Cache API entries (service-worker caches). The encrypted emergency queue lives in IndexedDB and is untouched (SECURITY §3.3). */
export async function clearBrowserCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    /* best effort */
  }
}

export type SignInResult = { status: "mfa_required" } | { status: "signed_in"; me: UserMe };

/** Sign-in, sign-out and facility switching. All unsafe requests go through the API client (CSRF, idempotency key). */
export function useAuth() {
  const api = useApi();
  const qc = useQueryClient();

  const loadMe = useCallback(async () => {
    const me = (await api.get<UserMe>("/auth/me")).data;
    qc.setQueryData(queryKeys.me, me);
    return me;
  }, [api, qc]);

  /** POST that recovers once from an expired CSRF cookie: refetch /auth/me to refresh it, then retry. */
  const post = useCallback(
    async (path: string, opts?: Parameters<typeof api.post>[1]) => {
      const options = { ...opts, idempotencyKey: opts?.idempotencyKey ?? createIntentIdempotencyKey() };
      try {
        return await api.post(path, options);
      } catch (e) {
        // Django reports a CSRF failure as `permission_denied` with a "CSRF Failed" message (audit A-22), not `csrf_failed`.
        if (e instanceof ApiError && (e.code === "csrf_failed" || /^CSRF Failed/i.test(e.message))) {
          await api.get("/auth/me").catch(() => undefined);
          return api.post(path, options);
        }
        throw e;
      }
    },
    [api],
  );

  /** Email or username, as typed. An "@" means email (MASTERPLAN D-18). */
  const identity = (identifier: string) => {
    const id = identifier.trim();
    return id.includes("@") ? { email: id } : { username: id };
  };

  /**
   * Password sign-in. `admin: true` uses the separate admin entrance (MASTERPLAN D-17), which is the only
   * place an admin account is accepted; the ordinary entrance answers an admin exactly like a wrong password.
   */
  const signIn = useCallback(
    async (identifier: string, password: string, opts?: { admin?: boolean }): Promise<SignInResult> => {
      try {
        await post(opts?.admin ? "/auth/admin/login" : "/auth/login", { body: { ...identity(identifier), password } });
      } catch (e) {
        if (e instanceof ApiError && e.code === "mfa_required") return { status: "mfa_required" };
        throw e;
      }
      return { status: "signed_in", me: await loadMe() };
    },
    [post, loadMe],
  );

  /** Patient self-registration. The server signs the new patient in. */
  const registerPatient = useCallback(
    async (v: { identifier: string; displayName: string; password: string }) => {
      await post("/auth/register", { body: { ...identity(v.identifier), display_name: v.displayName.trim(), password: v.password } });
      return loadMe();
    },
    [post, loadMe],
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      await post("/auth/mfa/verify", { body: { code: normalizeDigits(code).trim() } });
      return loadMe();
    },
    [post, loadMe],
  );

  /** Ends the session, then clears every cache, even when the request fails (shared computers). */
  const signOut = useCallback(async () => {
    try {
      await post("/auth/logout");
    } catch {
      /* the session may already be gone */
    } finally {
      qc.clear();
      await clearBrowserCaches();
    }
  }, [post, qc]);

  /** The response of POST /auth/active-facility is not a user object (audit A-03), so `me` is refetched. */
  const switchFacility = useCallback(
    async (facilityId: string) => {
      await post("/auth/active-facility", { body: { facility_id: facilityId } });
      qc.clear();
      return loadMe();
    },
    [post, qc, loadMe],
  );

  return { signIn, registerPatient, verifyMfa, signOut, switchFacility, refreshMe: loadMe };
}
