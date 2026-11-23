"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Siren } from "lucide-react";
import { usePageLocale } from "../../app/usePageLocale";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import type { Area } from "../../auth/access";
import { visibleNav } from "../../auth/nav";
import { IdleTimeout } from "../../auth/IdleTimeout";
import { useAuth } from "../../auth/me";
import type { UserMe } from "../../auth/types";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Dialog, DialogTrigger, SheetContent } from "../ui/overlays";
import { AccountMenu, roleLabel } from "./AccountMenu";
import { NavGlyph } from "./icons";
import { Mark } from "./Mark";

type WorkspaceArea = Exclude<Area, "patient">;

function facilityName(me: UserMe, locale: Locale): string {
  const f = me.active_facility;
  if (!f) return t(locale, me.roles.includes("platform_admin") ? "shell.allFacilities" : "shell.noFacility");
  return locale === "bn" && f.name_bn ? f.name_bn : f.name;
}

/** Sidebar content, shared by the fixed sidebar (lg+) and the sheet below lg. */
function SidebarContent({ me, locale, area, onNavigate }: { me: UserMe; locale: Locale; area: WorkspaceArea; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { signOut } = useAuth();
  const items = visibleNav(me, area);
  const main = items.filter((i) => !i.set_apart);
  const apart = items.filter((i) => i.set_apart);
  const current = (href: string) => pathname === `/${locale}${href}` || pathname.startsWith(`/${locale}${href}/`);

  const link = (item: (typeof items)[number]) => (
    <Link
      key={item.id}
      href={`/${locale}${item.href}`}
      onClick={onNavigate}
      aria-current={current(item.href) ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-control px-3 text-dense no-underline",
        current(item.href) ? "bg-indigo font-semibold text-surface" : "text-brand-foreground hover:bg-indigo",
        item.id === "emergency" && "border border-paddy",
      )}
    >
      <NavGlyph icon={item.icon} />
      <span>{t(locale, item.labelKey)}</span>
    </Link>
  );

  return (
    <div className="flex h-full flex-col gap-4 bg-brand p-3 text-brand-foreground">
      <div className="flex items-center gap-2 px-2 pt-1">
        <Mark tile />
        <p className="m-0 text-dense font-semibold">{facilityName(me, locale)}</p>
      </div>
      <nav aria-label={t(locale, "shell.mainNav")} className="flex flex-1 flex-col gap-1">
        {main.map(link)}
        {apart.length > 0 && <hr className="my-2 border-0 border-t border-indigo" />}
        {apart.map(link)}
      </nav>
      <div className="flex flex-col gap-2 border-t border-indigo pt-3">
        <Link href={`/${locale}/notifications`} className="flex min-h-11 items-center gap-3 rounded-control px-3 text-dense text-brand-foreground no-underline hover:bg-indigo">
          <Bell aria-hidden className="size-5" />
          {t(locale, "nav.notifications")}
        </Link>
        <p className="m-0 px-3 text-caption">
          {me.display_name}
          <span className="block opacity-80">{roleLabel(me, locale)}</span>
        </p>
        {/* Always-visible sign-out for shared computers (AUTH_RBAC §4.3). */}
        <Button
          variant="on-brand"
          size="sm"
          onClick={async () => {
            await signOut();
            router.replace(`/${locale}/signed-out`);
          }}
        >
          {t(locale, "shell.signOut")}
        </Button>
      </div>
    </div>
  );
}

/** Clinical and administration frame: sidebar and panes at lg+, top bar and sheet below. */
export function WorkspaceShell({ me, area, children }: { me: UserMe; area: WorkspaceArea; children: React.ReactNode }) {
  const locale = usePageLocale(undefined, "en");
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { signOut, refreshMe } = useAuth();
  const hasEmergency = visibleNav(me, area).some((i) => i.id === "emergency");

  // Focus shell: the emergency referral has no navigation, one exit, and nothing that can distract (APPLICATION_DESIGN §1).
  if (/\/emergency(\/|$)/.test(pathname)) {
    return (
      <div data-route-group="focus" className="min-h-dvh bg-paper">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
          <p className="m-0 text-dense font-semibold">{facilityName(me, locale)}</p>
          <Link href={`/${locale}/dashboard`} className="flex min-h-11 items-center text-dense text-indigo underline underline-offset-2">{t(locale, "emergencyForm.exit")}</Link>
        </header>
        <main id="main" className="p-4">{children}</main>
        <IdleTimeout locale={locale} onStay={() => refreshMe()} onTimeout={async () => { await signOut(); router.replace(`/${locale}/signed-out?reason=expired`); }} />
      </div>
    );
  }

  return (
    <div data-route-group={area === "clinical" ? "clinician" : "admin"} className="min-h-dvh bg-paper lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-3">{t(locale, "shell.skipToContent")}</a>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <SidebarContent me={me} locale={locale} area={area} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 lg:hidden">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="quiet" aria-label={t(locale, "shell.menu")}>
                <Menu aria-hidden className="size-5" />
              </Button>
            </DialogTrigger>
            <SheetContent side="right" title={t(locale, "shell.menu")} closeLabel={t(locale, "common.close")} className="p-0">
              <SidebarContent me={me} locale={locale} area={area} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Dialog>
          <p className="m-0 min-w-0 flex-1 truncate text-dense font-semibold">{facilityName(me, locale)}</p>
          {hasEmergency && (
            <Link href={`/${locale}/emergency`} aria-label={t(locale, "nav.emergency")} className="flex size-11 items-center justify-center rounded-control border border-signal text-signal">
              <Siren aria-hidden className="size-5" />
            </Link>
          )}
          <AccountMenu me={me} locale={locale} area={area} />
        </header>
        <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">
          {children}
        </main>
        <IdleTimeout
          locale={locale}
          onStay={() => refreshMe()}
          onTimeout={async () => {
            await signOut();
            router.replace(`/${locale}/signed-out?reason=expired`);
          }}
        />
      </div>
    </div>
  );
}
