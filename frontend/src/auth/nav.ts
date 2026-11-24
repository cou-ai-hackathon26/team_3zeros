import { PERMISSIONS, can, canEnter, hasRole, type Area } from "./access";
import type { UserMe } from "./types";

export type NavIcon =
  | "home" | "stethoscope" | "calendar" | "file" | "inbox" | "users" | "arrows" | "siren"
  | "building" | "clock" | "gauge" | "badge" | "book";

export interface NavItem {
  id: string;
  /** i18n key under `nav.` */
  labelKey: string;
  /** Path without the locale prefix. */
  href: string;
  icon: NavIcon;
  /** Set apart below a divider in the sidebar (the emergency entry). */
  set_apart?: boolean;
  visible?: (me: UserMe) => boolean;
}

const clinicianOnly = (me: UserMe) => hasRole(me, "clinician");

const NAV: Record<Area, NavItem[]> = {
  patient: [
    { id: "home", labelKey: "nav.home", href: "/home", icon: "home" },
    { id: "doctors", labelKey: "nav.doctors", href: "/doctors", icon: "stethoscope" },
    { id: "appointments", labelKey: "nav.appointments", href: "/appointments", icon: "calendar" },
    { id: "reports", labelKey: "nav.reports", href: "/reports", icon: "file" },
  ],
  clinical: [
    { id: "queue", labelKey: "nav.queue", href: "/dashboard", icon: "inbox" },
    {
      id: "patients",
      labelKey: "nav.patients",
      href: "/patients",
      icon: "users",
      visible: (me) => clinicianOnly(me) || can(me, PERMISSIONS.referralCreate),
    },
    {
      id: "referrals",
      labelKey: "nav.referrals",
      href: "/referrals",
      icon: "arrows",
      visible: (me) =>
        clinicianOnly(me) ||
        can(me, PERMISSIONS.referralAcknowledge) ||
        can(me, PERMISSIONS.referralCreate),
    },
    {
      id: "ed",
      labelKey: "nav.ed",
      href: "/ed",
      icon: "siren",
      visible: (me) => clinicianOnly(me) || can(me, PERMISSIONS.edManage),
    },
    {
      id: "emergency",
      labelKey: "nav.emergency",
      href: "/emergency",
      icon: "siren",
      set_apart: true,
      visible: (me) => clinicianOnly(me) || can(me, PERMISSIONS.emergencyCreate),
    },
  ],
  admin: [
    { id: "facility", labelKey: "nav.facility", href: "/facility", icon: "building" },
    { id: "schedules", labelKey: "nav.schedules", href: "/schedules", icon: "clock" },
    { id: "capacity", labelKey: "nav.capacity", href: "/capacity", icon: "gauge" },
    { id: "staff", labelKey: "nav.staff", href: "/staff", icon: "badge" },
    // Reference books for triage (D-29): platform admins only.
    { id: "knowledge", labelKey: "nav.knowledge", href: "/knowledge", icon: "book", visible: (me) => hasRole(me, "platform_admin") },
  ],
};

/** Navigation items this user may see in an area (AUTH_RBAC §5.3). Empty when the user cannot enter the area. */
export function visibleNav(me: UserMe | null | undefined, area: Area): NavItem[] {
  if (!me || !canEnter(me, area)) return [];
  return NAV[area].filter((item) => !item.visible || item.visible(me));
}
