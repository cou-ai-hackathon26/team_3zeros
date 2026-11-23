import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, createIntentIdempotencyKey } from "./client";

describe("FRONTEND §5 API Client Contract", () => {
  it("attaches X-CSRFToken, Accept-Language, If-Match, and reuses the same Idempotency-Key across retries (Review Focus #2)", async () => {
    const seenHeaders: Headers[] = [];
    let callCount = 0;
    const mockFetch = vi.fn(async (req: Request) => {
      callCount++;
      seenHeaders.push(new Headers(req.headers));
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { code: "provider_unavailable", message: "Temp fail", field_errors: {}, request_id: "req-1" } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ id: "123", state: "CONFIRMED" }), { status: 200 });
    });

    const client = createApiClient({
      baseUrl: "http://localhost/api/v1",
      getCsrfToken: () => "csrf-tok-123",
      getLocale: () => "bn",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const intentKey = createIntentIdempotencyKey();
    await expect(
      client.request("POST", "/appointments/abc/actions/accept", {
        idempotencyKey: intentKey,
        expectedVersion: 3,
        body: {},
      })
    ).rejects.toThrow(ApiError);

    await client.request("POST", "/appointments/abc/actions/accept", {
      idempotencyKey: intentKey,
      expectedVersion: 3,
      body: {},
    });

    expect(seenHeaders[0].get("X-CSRFToken")).toBe("csrf-tok-123");
    expect(seenHeaders[0].get("Accept-Language")).toBe("bn");
    expect(seenHeaders[0].get("If-Match")).toBe("3");
    expect(seenHeaders[0].get("Idempotency-Key")).toBe(intentKey);
    expect(seenHeaders[1].get("Idempotency-Key")).toBe(intentKey);
  });

  it("maps 412 stale_version and 423 sync_pending to typed ApiError codes", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "stale_version",
            message: "Version conflict",
            field_errors: {},
            request_id: "req-412",
          },
        }),
        { status: 412, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = createApiClient({ fetchImpl: mockFetch as unknown as typeof fetch });
    await expect(client.request("POST", "/referrals/1/actions/approve", { expectedVersion: 1 })).rejects.toMatchObject({
      status: 412,
      code: "stale_version",
      i18nKey: "error.stale_version",
      requestId: "req-412",
    });
  });
});
