/**
 * What the patient is shown after confirming a triage summary, by AI triage level (D-30).
 * One pure function, like nextStep.ts. The level is an AI draft and never blocks care (INV-16):
 * EMERGENCY shows the emergency screen and no booking; everything else still allows booking a doctor.
 */
export type TriageLevel = "LOW" | "MODERATE" | "HIGH" | "EMERGENCY";
export type TriageRouteBlock = "emergency" | "urgent" | "doctors" | "watch";

export function triageRoute(level: TriageLevel | null | undefined): TriageRouteBlock {
  switch (level) {
    case "EMERGENCY":
      return "emergency";
    case "HIGH":
      return "urgent";
    case "LOW":
      return "watch";
    default:
      return "doctors"; // MODERATE, or not assessed: see a doctor
  }
}
