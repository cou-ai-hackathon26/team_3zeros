/**
 * Flags for flows with no backend contract yet (AUTH_RBAC §6). All default off,
 * and each is tied to an open question in MASTERPLAN §8.2. Read statically so
 * Next.js can inline them.
 */
export const FEATURES = {
  /** Q-14 */
  passwordReset: process.env.NEXT_PUBLIC_FEATURE_PASSWORD_RESET === "true",
  /** Q-15 */
  patientProfile: process.env.NEXT_PUBLIC_FEATURE_PATIENT_PROFILE === "true",
  /** Q-16 / D-19 (Phase B) active */
  accessRequest: process.env.NEXT_PUBLIC_FEATURE_ACCESS_REQUEST !== "false",
  /** Q-17 */
  emailVerification: process.env.NEXT_PUBLIC_FEATURE_EMAIL_VERIFICATION === "true",
} as const;

/**
 * Landing-page claims that depend on a deployment fact or an approval (LANDING_PAGE §4.4, §4.5).
 * All default off, so the page says nothing the project cannot yet support.
 */
export const CLAIMS = {
  /** Q-05: voice triage is enabled for this deployment. Otherwise tile A reads "Type in…". */
  voice: process.env.NEXT_PUBLIC_FEATURE_VOICE_TRIAGE === "true",
  /** Q-09: offline emergency mode is enabled. Otherwise tile F is omitted. */
  offlineEmergency: process.env.NEXT_PUBLIC_FEATURE_OFFLINE_EMERGENCY === "true",
  /** Q-06: the red-flag rule set has clinical approval. */
  rulesApproved: process.env.NEXT_PUBLIC_CLAIM_RULES_APPROVED === "true",
  /** Q-07: consent wording is approved. */
  consentWordingApproved: process.env.NEXT_PUBLIC_CLAIM_CONSENT_APPROVED === "true",
  /** Audit A-02 fixed: the sign-in code is a real one-time code. */
  otpIsReal: process.env.NEXT_PUBLIC_CLAIM_OTP_REAL === "true",
} as const;
