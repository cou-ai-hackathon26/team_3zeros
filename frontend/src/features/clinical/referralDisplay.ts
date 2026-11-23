import type { StatusTone } from "../../components/StatusBadge/StatusBadge";

export const FINISHED_REFERRAL = ["CLOSED", "DECLINED", "CANCELLED", "EXPIRED"];

export function referralTone(state: string): StatusTone {
  if (state === "ESCALATED") return "emergency";
  if (state === "DRAFT") return "draft";
  if (state === "FAILED_TO_SYNC") return "attention";
  if (state === "ACKNOWLEDGED_BY_RECEIVER" || state === "IN_PROGRESS" || state === "OUTCOME_RETURNED") return "positive";
  if (FINISHED_REFERRAL.includes(state)) return "neutral";
  return "active";
}
