import { ApiError } from "../api/client";

export type AuthContext = "otp" | "staff" | "mfa";

/** i18n key for the message to show under a failed auth request. Never says which credential was wrong. */
export function authErrorKey(error: unknown, context: AuthContext): string {
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === "rate_limited") return "auth.error.rateLimited";
    if (context === "staff") {
      if (error.code === "not_authenticated") return "auth.error.badCredentials";
      if (error.code === "permission_denied") return "auth.error.inactive";
    }
    if (context === "mfa" && /no pending mfa/i.test(error.message)) return "auth.error.mfaLost";
    if (error.code === "validation_error") return context === "mfa" ? "auth.error.badMfa" : "auth.error.badCode";
    return "error.generic";
  }
  return "auth.error.offline";
}
