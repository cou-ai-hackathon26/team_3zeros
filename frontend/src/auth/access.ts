import type { UserMe } from "./types";

/**
 * The only module that names role and permission strings (AUTH_RBAC §5.2).
 * Roles are the MASTERPLAN §4.1 codes; a test keeps this list equal to the masterplan.
 * Hiding navigation is a convenience: the API decides what a user may do (INV-9).
 * Buttons on a case come from the object's `allowed_actions`, never from here.
 */
export const ROLES = ["patient", "clinician", "facility_staff", "facility_admin", "platform_admin"] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = ["patient", "clinical", "admin"] as const;
export type Area = (typeof AREAS)[number];

const AREA_ROLES: Record<Area, readonly Role[]> = {
  patient: ["patient"],
  clinical: ["clinician", "facility_staff"],
  admin: ["facility_admin", "platform_admin"],
};

/** Permission strings found in backend code (audit A-11). Used for navigation only. */
export const PERMISSIONS = {
  scheduleManage: "schedule.manage",
  referralAcknowledge: "referral.acknowledge",
  referralCreate: "referral.create",
  consentRecordAssisted: "consent.record_assisted",
  emergencyCreate: "emergency.create",
  edManage: "ed.manage",
} as const;

const AREA_HOME: Record<Area, string> = { patient: "/home", clinical: "/dashboard", admin: "/facility" };

const AREA_PREFIXES: Record<Area, readonly string[]> = {
  patient: ["home", "triage", "doctors", "appointments", "consents", "reports", "notifications"],
  clinical: ["dashboard", "patients", "referrals", "emergency", "ed"],
  admin: ["facility", "schedules", "capacity", "staff"],
};

// Q-03 is open: triage and doctor discovery stay reachable without an account.
const OPEN_PREFIXES = ["triage", "doctors"] as const;

/** True for area paths that signed-out visitors may open while Q-03 is undecided. `subPath` has no locale prefix. */
export function isOpenPath(subPath: string): boolean {
  const first = subPath.split("/").filter(Boolean)[0];
  return OPEN_PREFIXES.some((p) => p === first);
}

export function hasRole(me: UserMe | null | undefined, role: Role): boolean {
  return !!me && me.roles.includes(role);
}

export function can(me: UserMe | null | undefined, permission: string): boolean {
  return !!me && me.permissions.includes(permission);
}

export function canEnter(me: UserMe | null | undefined, area: Area): boolean {
  return AREA_ROLES[area].some((r) => hasRole(me, r));
}

/** Areas the user may enter, in the fixed order of AREAS. Unknown role strings are ignored. */
export function areasOf(me: UserMe | null | undefined): Area[] {
  return AREAS.filter((a) => canEnter(me, a));
}

/** Area that owns a path such as `/bn/dashboard`, or null for public, auth and shared paths. */
export function areaOfPath(path: string): Area | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "bn" || segments[0] === "en") segments.shift();
  const first = segments[0];
  if (!first) return null;
  return AREAS.find((a) => AREA_PREFIXES[a].includes(first)) ?? null;
}

export type Landing = { kind: "home"; path: string } | { kind: "choose" } | { kind: "none" };

/** Where to send a user who has just signed in and has no valid `next` (AUTH_RBAC §4.4). */
export function landingFor(me: UserMe | null | undefined, lastArea?: Area | null): Landing {
  const areas = areasOf(me);
  if (areas.length === 0) return { kind: "none" };
  if (areas.length === 1) return { kind: "home", path: AREA_HOME[areas[0]] };
  if (lastArea && areas.includes(lastArea)) return { kind: "home", path: AREA_HOME[lastArea] };
  return { kind: "choose" };
}

export function homePath(area: Area): string {
  return AREA_HOME[area];
}

/**
 * Accepts `next` only when it is a same-origin path (including its locale
 * prefix) inside an area this user may enter. Anything else returns null.
 */
export function resolveNext(next: string | null | undefined, me: UserMe | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  const pathname = next.split(/[?#]/)[0];
  const area = areaOfPath(pathname);
  if (!area || !canEnter(me, area)) return null;
  return next;
}
