import { AREAS, type Area } from "./access";

// Non-sensitive preference: which area a multi-area user used last (AUTH_RBAC §2).
const KEY = "mw_last_area";

export function getLastArea(): Area | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return AREAS.find((a) => a === v) ?? null;
  } catch {
    return null;
  }
}

export function setLastArea(area: Area): void {
  try {
    window.localStorage.setItem(KEY, area);
  } catch {
    /* storage unavailable: preference is simply not remembered */
  }
}
