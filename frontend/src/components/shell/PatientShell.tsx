"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { useConsents, useNotifications } from "../../api/queries/hooks";
import { fill } from "../../features/patient/display";
import { visibleNav } from "../../auth/nav";
import { useMe } from "../../auth/me";
import { cn } from "../../lib/cn";
import { buttonVariants } from "../ui/button";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import dynamic from "next/dynamic";
import { CircleUser } from "lucide-react";
import { NavGlyph } from "./icons";
import { Wordmark } from "./Mark";

// The account menu pulls in Radix dropdown and radio group. It loads after first paint so the patient
// routes stay inside the 170 KB budget; the placeholder keeps the same size, so nothing shifts.
const AccountMenu = dynamic(() => import("./AccountMenu").then((m) => m.AccountMenu), {
  ssr: false,
  loading: () => <span aria-hidden className="flex min-h-11 items-center px-2"><CircleUser className="size-6" /></span>,
});

/**
 * Phone: top bar + bottom tab bar (icon and word, aria-current). Desktop: top navigation.
 * Signed-out visitors (Q-03) see the top bar with "Sign in" and no tab bar.
 */
export function PatientShell({ children }: { children: React.ReactNode }) {
  const locale = usePageLocale(undefined, "bn");
  const pathname = usePathname() ?? "";
  const { me } = useMe();
  const subPath = pathname.replace(/^\/(bn|en)(?=\/|$)/, "") || "/";
  const isFocus = subPath === "/triage" || subPath.startsWith("/triage/session/");
  const isSignedInPatient = Boolean(me && me.roles.includes("patient") && !isFocus);
  const notifications = useNotifications(isSignedInPatient);
  const consents = useConsents(isSignedInPatient);
  const unreadCount = (notifications.data?.results ?? []).filter((n) => !n.read_at && n.state !== "READ").length;
  const pendingConsentCount = (consents.data?.pending_requests ?? []).filter((r) => r.state === "PENDING").length;
  const items = isFocus ? [] : visibleNav(me, "patient");
  const isCurrent = (href: string) => pathname === `/${locale}${href}` || pathname.startsWith(`/${locale}${href}/`);

  if (isFocus) {
    const exitHref = `/${locale}${me ? "/home" : ""}`;
    return (
      <div data-route-group="patient" data-shell="focus" className="flex min-h-dvh flex-col bg-paper">
        <a href="#main" className="sr-only focus:not-sr-only focus:p-3">{t(locale, "shell.skipToContent")}</a>
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
          <Link href={exitHref} className="no-underline" aria-label="Medi Waypoint">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch locale={locale} />
            {!me && (
              <Link href={`/${locale}/login`} className={buttonVariants({ variant: "quiet", size: "sm" })}>
                {t(locale, "shell.signIn")}
              </Link>
            )}
            <Link href={exitHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t(locale, "shell.exitFocus")}
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div data-route-group="patient" className="flex min-h-dvh flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:p-3">{t(locale, "shell.skipToContent")}</a>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
        <Link href={`/${locale}${me ? "/home" : ""}`} className="no-underline" aria-label="Medi Waypoint">
          <Wordmark />
        </Link>
        {items.length > 0 && (
          <nav aria-label={t(locale, "shell.mainNav")} className="hidden items-center gap-1 lg:flex">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/${locale}${item.href}`}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-control px-3 text-dense no-underline",
                  isCurrent(item.href) ? "bg-indigo-wash font-semibold text-ink" : "text-ink hover:bg-sunken",
                )}
              >
                {t(locale, item.labelKey)}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {me ? (
            <>
              <Link
                href={`/${locale}/notifications`}
                aria-label={t(locale, "nav.notifications")}
                className="relative flex size-11 items-center justify-center rounded-control hover:bg-sunken"
              >
                <Bell aria-hidden className="size-5" />
                {unreadCount > 0 && (
                  <>
                    <span aria-hidden="true" className="absolute end-2 top-2 size-2 rounded-pill bg-indigo" />
                    <span className="sr-only">{fill(t(locale, "shell.unreadNotifications"), { n: unreadCount })}</span>
                  </>
                )}
              </Link>
              <div className="relative">
                <AccountMenu me={me} locale={locale} area="patient" extraItems={[{ href: "/consents", label: t(locale, "nav.consents") }]} />
                {pendingConsentCount > 0 && (
                  <>
                    <span aria-hidden="true" className="pointer-events-none absolute end-1 top-1 size-2 rounded-pill bg-indigo" />
                    <span className="sr-only">{fill(t(locale, "shell.pendingConsents"), { n: pendingConsentCount })}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <LanguageSwitch locale={locale} />
              <Link href={`/${locale}/login`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                {t(locale, "shell.signIn")}
              </Link>
            </>
          )}
        </div>
      </header>

      <main id="main" className={cn("mx-auto w-full max-w-[960px] flex-1 px-4 py-6", items.length > 0 && "pb-24 lg:pb-6")}>
        {children}
      </main>

      {items.length > 0 && (
        <nav aria-label={t(locale, "shell.mainNav")} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface lg:hidden">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/${locale}${item.href}`}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption no-underline",
                isCurrent(item.href) ? "bg-indigo-wash font-semibold text-ink" : "text-ink-muted",
              )}
            >
              <NavGlyph icon={item.icon} />
              <span>{t(locale, item.labelKey)}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
