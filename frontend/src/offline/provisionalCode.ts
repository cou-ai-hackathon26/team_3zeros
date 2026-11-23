/**
 * FRONTEND §9.3 & MASTERPLAN §7, §8.2 (Q-09):
 * Provisional reference code generator for offline emergency referral slips.
 * Proposed format pending Q-09: facility short code + 4-digit sequence + MMDD (e.g. UHC12-0045-1123).
 */
export function generateProvisionalCode(
  facilityShortCode: string,
  sequenceNumber: number,
  dateIso: string = new Date().toISOString()
): string {
  const cleanCode = (facilityShortCode || "FAC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const seq = String(sequenceNumber).padStart(4, "0");
  const d = new Date(dateIso);
  const mm = String((Number.isNaN(d.getTime()) ? new Date() : d).getUTCMonth() + 1).padStart(2, "0");
  const dd = String((Number.isNaN(d.getTime()) ? new Date() : d).getUTCDate()).padStart(2, "0");
  return `${cleanCode}-${seq}-${mm}${dd}`;
}
