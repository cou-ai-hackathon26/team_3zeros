import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { queryKeys } from "../api/queries";
import { useAuth, useMe } from "./me";
import { useAppointments } from "../api/queries/hooks";
import type { UserMe } from "./types";

const ME: UserMe = {
  id: "u1", email: "d@example.org", phone: null, display_name: "Dr. R", preferred_language: "en",
  roles: ["clinician"], active_facility: { id: "f1", name: "Tangail" }, permissions: [], is_platform_admin: false,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const err = (code: string, status: number) => json({ error: { code, message: code, request_id: "r1" } }, status);

function setup(handler: (req: Request) => Response | Promise<Response>, onUnauthenticated?: () => void) {
  const calls: { method: string; path: string; body: string; headers: Headers }[] = [];
  const fetchImpl = async (req: Request) => {
    calls.push({ method: req.method, path: new URL(req.url).pathname.replace("/api/v1", ""), body: await req.clone().text(), headers: new Headers(req.headers) });
    return handler(req);
  };
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch, onUnauthenticated });
  const qc = makeQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <AppProviders client={client} queryClient={qc}>{children}</AppProviders>;
  return { wrapper, calls, qc };
}

describe("useMe", () => {
  it("returns the user on 200", async () => {
    const { wrapper } = setup(() => json(ME));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.me?.display_name).toBe("Dr. R");
  });

  it("treats 401 as signed out (null), not as an error", async () => {
    const { wrapper } = setup(() => err("not_authenticated", 401));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.me).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("also treats 403 with code not_authenticated as signed out (DRF session auth, audit A-20)", async () => {
    const { wrapper } = setup(() => err("not_authenticated", 403));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.me).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("does not treat a plain 403 permission_denied as signed out", async () => {
    const { wrapper } = setup(() => err("permission_denied", 403));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.me).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });

  it("reports other failures as errors with the request id", async () => {
    const { wrapper } = setup(() => err("provider_unavailable", 503));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
  });
});

describe("sign-in flows (email or username and password, no one-time codes)", () => {
  it("sends an email as email and anything else as username, to /auth/login", async () => {
    const { wrapper, calls } = setup((req) => (req.url.endsWith("/auth/me") ? json(ME) : json({ message: "ok" })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    let out: { status: string; me?: UserMe } | undefined;
    await act(async () => { out = await result.current.signIn("dr@example.org", "pw"); });
    expect(calls[0].path).toBe("/auth/login");
    expect(JSON.parse(calls[0].body)).toEqual({ email: "dr@example.org", password: "pw" });
    expect(calls[0].headers.get("X-CSRFToken")).toBe("csrf");
    expect(out?.status).toBe("signed_in");
    await act(async () => { await result.current.signIn("karim99", "pw"); });
    expect(JSON.parse(calls[2].body)).toEqual({ username: "karim99", password: "pw" });
  });

  it("the admin entrance posts to /auth/admin/login and reports mfa_required without throwing", async () => {
    const { wrapper, calls } = setup(() => err("mfa_required", 401));
    const { result } = renderHook(() => useAuth(), { wrapper });
    let out: unknown;
    await act(async () => { out = await result.current.signIn("root@example.org", "pw", { admin: true }); });
    expect(calls[0].path).toBe("/auth/admin/login");
    expect(out).toEqual({ status: "mfa_required" });
  });

  it("bad credentials surface as ApiError and never trigger the session-expired handler", async () => {
    const onUnauthenticated = vi.fn();
    const { wrapper } = setup(() => err("not_authenticated", 401), onUnauthenticated);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await expect(result.current.signIn("a@b.co", "bad")).rejects.toMatchObject({ code: "not_authenticated" }); });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("registers a patient with display name, then loads the signed-in user", async () => {
    const { wrapper, calls } = setup((req) => (req.url.endsWith("/auth/me") ? json({ ...ME, roles: ["patient"] }) : json({ message: "ok" }, 201)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    let me: UserMe | undefined;
    await act(async () => { me = await result.current.registerPatient({ identifier: "karim@example.org", displayName: " Karim ", password: "a-long-passphrase-9" }); });
    expect(calls[0].path).toBe("/auth/register");
    expect(JSON.parse(calls[0].body)).toEqual({ email: "karim@example.org", display_name: "Karim", password: "a-long-passphrase-9" });
    expect(me?.roles).toEqual(["patient"]);
  });

  it("a 403 not_authenticated outside /auth/ triggers the session-expired handler", async () => {
    const onUnauthenticated = vi.fn();
    const { wrapper } = setup(() => err("not_authenticated", 403), onUnauthenticated);
    const { result } = renderHook(() => useAppointments(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onUnauthenticated).toHaveBeenCalled();
  });
});

describe("sign out and facility switch", () => {
  it("sign-out posts logout, clears the query cache even if the request fails", async () => {
    const { wrapper, qc, calls } = setup(() => err("provider_unavailable", 503));
    qc.setQueryData(queryKeys.me, ME);
    qc.setQueryData(queryKeys.appointments(), { results: [] });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.signOut(); });
    expect(calls[0].path).toBe("/auth/logout");
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("facility switch posts the id, clears all data, and refetches me (the response is not stored as me)", async () => {
    const { wrapper, qc, calls } = setup((req) =>
      req.url.endsWith("/auth/active-facility") ? json({ message: "ok", active_facility_id: "f2" }) : json({ ...ME, active_facility: { id: "f2", name: "Mirzapur" } }));
    qc.setQueryData(queryKeys.appointments(), { results: [1] });
    const { result } = renderHook(() => useAuth(), { wrapper });
    let me: UserMe | undefined;
    await act(async () => { me = await result.current.switchFacility("f2"); });
    expect(JSON.parse(calls[0].body)).toEqual({ facility_id: "f2" });
    expect(me?.active_facility?.id).toBe("f2");
    expect(qc.getQueryData(queryKeys.appointments())).toBeUndefined();
    expect((qc.getQueryData(queryKeys.me) as UserMe).display_name).toBe("Dr. R");
  });
});

describe("csrf recovery", () => {
  it("on csrf_failed refetches /auth/me once to refresh the cookie, then retries the request once", async () => {
    let posts = 0;
    const { wrapper, calls } = setup((req) => {
      if (req.url.endsWith("/auth/me")) return json(ME);
      posts++;
      return posts === 1 ? err("csrf_failed", 403) : json({ message: "sent" });
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.signIn("a@b.co", "pw"); });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /auth/login", "GET /auth/me", "POST /auth/login", "GET /auth/me"]);
  });

  it("recognises Django's wording: permission_denied with a CSRF Failed message", async () => {
    let posts = 0;
    const { wrapper, calls } = setup((req) => {
      if (req.url.endsWith("/auth/me")) return json(ME);
      posts++;
      return posts === 1 ? json({ error: { code: "permission_denied", message: "CSRF Failed: Origin checking failed", request_id: "r" } }, 403) : json({ message: "sent" });
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.signIn("a@b.co", "pw"); });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("does not retry a second time", async () => {
    const { wrapper, calls } = setup((req) => (req.url.endsWith("/auth/me") ? json(ME) : err("csrf_failed", 403)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await expect(result.current.signIn("a@b.co", "pw")).rejects.toMatchObject({ code: "csrf_failed" }); });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });
});
