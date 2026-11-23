import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createApiClient, ApiError } from "../client";
import { AppProviders, makeQueryClient, shouldRetry } from "./provider";
import { useAppointments, useTransition, withQuery } from "./hooks";

function setup(fetchImpl: (req: Request) => Promise<Response>) {
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch });
  const qc = makeQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppProviders client={client} queryClient={qc}>{children}</AppProviders>
  );
  return { wrapper, qc };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("query layer", () => {
  it("builds query strings without empty values", () => {
    expect(withQuery("/appointments", { state: "REQUESTED", role_view: "" , x: undefined })).toBe("/appointments?state=REQUESTED");
    expect(withQuery("/appointments")).toBe("/appointments");
  });

  it("does not retry client errors but retries server errors twice", () => {
    const e4 = new ApiError({ status: 404, code: "not_found", message: "" });
    const e5 = new ApiError({ status: 503, code: "provider_unavailable", message: "" });
    expect(shouldRetry(0, e4)).toBe(false);
    expect(shouldRetry(0, e5)).toBe(true);
    expect(shouldRetry(2, e5)).toBe(false);
  });

  it("loads a cursor page through the provided client", async () => {
    const fetchImpl = vi.fn(async () => json({ results: [{ id: "a1", state: "REQUESTED" }], next_cursor: null }));
    const { wrapper } = setup(fetchImpl);
    const { result } = renderHook(() => useAppointments({ role_view: "patient" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results[0].id).toBe("a1");
    expect((fetchImpl.mock.calls[0] as unknown as [Request])[0].url).toContain("/appointments?role_view=patient");
  });

  it("surfaces an ApiError with the request id on failure", async () => {
    const fetchImpl = async () => json({ error: { code: "not_found", message: "No", request_id: "req-7" } }, 404);
    const { wrapper } = setup(fetchImpl);
    const { result } = renderHook(() => useAppointments(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).requestId).toBe("req-7");
  });

  it("sends If-Match, Idempotency-Key and CSRF on a transition, and reports a 202 as pending", async () => {
    const seen: Headers[] = [];
    const fetchImpl = async (req: Request) => { seen.push(new Headers(req.headers)); return json({ id: "r1", state: "APPROVED_BY_SENDER" }, 202); };
    const { wrapper } = setup(fetchImpl);
    const { result } = renderHook(() => useTransition("referrals"), { wrapper });
    let out: { pending: boolean } | undefined;
    await act(async () => { out = await result.current.mutateAsync({ id: "r1", action: "send", version: 4, idempotencyKey: "intent-1" }); });
    expect(out?.pending).toBe(true);
    expect(seen[0].get("If-Match")).toBe("4");
    expect(seen[0].get("Idempotency-Key")).toBe("intent-1");
    expect(seen[0].get("X-CSRFToken")).toBe("csrf");
  });
});
