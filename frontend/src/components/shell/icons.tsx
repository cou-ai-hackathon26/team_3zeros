import React from "react";
import {
  Home, Stethoscope, CalendarDays, FileText, Inbox, Users, ArrowLeftRight, Siren, Building2, Clock, Gauge, BadgeCheck, BookOpen,
} from "lucide-react";
import type { NavIcon } from "../../auth/nav";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  home: Home, stethoscope: Stethoscope, calendar: CalendarDays, file: FileText, inbox: Inbox, users: Users,
  arrows: ArrowLeftRight, siren: Siren, building: Building2, clock: Clock, gauge: Gauge, badge: BadgeCheck, book: BookOpen,
};

export function NavGlyph({ icon, className = "size-5" }: { icon: NavIcon; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden className={className} />;
}
