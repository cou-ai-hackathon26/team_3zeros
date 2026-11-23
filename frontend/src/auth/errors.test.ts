import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { authErrorKey } from "./errors";

const api = (status: number, code: string) => new ApiError({ status, code, message: code, requestId: "r1" });

describe("authErrorKey (AUTH_RBAC §4.1, §4.2)", () => {
  it("maps staff sign-in answers without revealing which field was wrong", () => {
    expect(authErrorKey(api(401, "not_authenticated"), "staff")).toBe("auth.error.badCredentials");
    expect(authErrorKey(api(403, "permission_denied"), "staff")).toBe("auth.error.inactive");
  });
  it("maps code verification failures", () => {
    expect(authErrorKey(api(400, "validation_error"), "otp")).toBe("auth.error.badCode");
    expect(authErrorKey(api(400, "validation_error"), "mfa")).toBe("auth.error.badMfa");
  });
  it("maps rate limiting, offline and unknown errors", () => {
    expect(authErrorKey(api(429, "rate_limited"), "otp")).toBe("auth.error.rateLimited");
    expect(authErrorKey(new TypeError("Failed to fetch"), "otp")).toBe("auth.error.offline");
    expect(authErrorKey(api(500, "generic"), "otp")).toBe("error.generic");
  });
  it("treats a lost MFA session as a request to sign in again", () => {
    expect(authErrorKey(new ApiError({ status: 400, code: "validation_error", message: "No pending MFA session found." }), "mfa")).toBe("auth.error.mfaLost");
  });
});
