"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleUser } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { areasOf, homePath, type Area } from "../../auth/access";
import { useAuth } from "../../auth/me";
import { setLastArea } from "../../auth/lastArea";
import type { UserMe } from "../../auth/types";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/overlays";

export function roleLabel(me: UserMe, locale: Locale): string {
  const first = me.roles[0];
  return first ? t(locale, `role.${first}`) : "";
}

/**
 * Name, role, language, shortcuts and Sign out. The area switcher appears only for
 * users who can enter more than one area (AUTH_RBAC §2); nobody else sees another area's name.
 */
export function AccountMenu({
  me,
  locale,
  area,
  extraItems = [],
}: {
  me: UserMe;
  locale: Locale;
  area: Area;
  extraItems?: { href: string; label: string }[];
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const otherAreas = areasOf(me).filter((a) => a !== area);

  async function handleSignOut() {
    await signOut();
    router.replace(`/${locale}/signed-out`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t(locale, "shell.account")}
        className="flex min-h-11 items-center gap-2 rounded-control px-2 hover:bg-sunken"
      >
        <CircleUser aria-hidden className="size-6" />
        <span className="hidden text-dense md:inline">{me.display_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-3 py-2">
          <p className="m-0 text-dense font-semibold">{me.display_name}</p>
          <p className="m-0 text-caption text-ink-muted">{roleLabel(me, locale)}</p>
        </div>
        {extraItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={`/${locale}${item.href}`}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
        {otherAreas.map((a) => (
          <DropdownMenuItem key={a} asChild>
            <Link href={`/${locale}${homePath(a)}`} onClick={() => setLastArea(a)}>
              {t(locale, "shell.switchArea")}: {t(locale, `area.${a}`)}
            </Link>
          </DropdownMenuItem>
        ))}
        <div className="px-3 py-2" onKeyDown={(e) => e.stopPropagation()}>
          <LanguageSwitch locale={locale} />
        </div>
        <DropdownMenuItem onSelect={handleSignOut}>{t(locale, "shell.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
