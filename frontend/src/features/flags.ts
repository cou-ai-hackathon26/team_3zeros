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
  /** Q-16 */
  accessRequest: process.env.NEXT_PUBLIC_FEATURE_ACCESS_REQUEST === "true",
  /** Q-17 */
  emailVerification: process.env.NEXT_PUBLIC_FEATURE_EMAIL_VERIFICATION === "true",
} as const;
