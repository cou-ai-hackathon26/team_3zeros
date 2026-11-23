"use client";

import "../../i18n/landing";
import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { landingFor } from "../../auth/access";
import { useMe } from "../../auth/me";
import { buttonVariants } from "../ui/button";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { Wordmark } from "./Mark";

// The phone menu pulls in the Radix dialog, so it loads on demand.
const MobileMenu = dynamic(() => import("./MobileMenu").then((m) => m.MobileMenu), {
  ssr: false,
  loading: () => <span aria-hidden className="flex size-11 items-center justify-center"><Menu className="size-5" /></span>,
});

const SECTIONS = [
  { id: "how", key: "landing.nav.how" },
  { id: "features", key: "landing.nav.features" },
  { id: "safety", key: "landing.nav.safety" },
  { id: "for-doctors", key: "landing.nav.forDoctors" },
] as const;

/**
 * Public pages. On the landing page it also carries the section links and a phone menu, and its
 * action is secondary because the hero holds the page's one primary button. A signed-in user sees
 * "Go to my home" instead of the sign-in links (APPLICATION_DESIGN §3).
 */
export function PublicHeader() {
  const locale = usePageLocale(undefined, "bn");
  const pathname = usePathname() ?? "";
  const { me } = useMe();
  const isLanding = /^\/(bn|en)\/?$/.test(pathname);
  const landing = me ? landingFor(me) : null;
  const homeHref = landing?.kind === "home" ? `/${locale}${landing.path}` : `/${locale}/login/choose`;
  const sections = SECTIONS.map((s) => ({ href: `#${s.id}`, label: t(locale, s.key) }));

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
      <Link href={`/${locale}`} className="no-underline" aria-label="Medi Waypoint">
        <Wordmark />
      </Link>
      {isLanding && (
        <nav aria-label={t(locale, "landing.nav.label")} className="hidden items-center gap-1 lg:flex">
          {sections.map((s) => (
            <a key={s.href} href={s.href} className="flex min-h-11 items-center rounded-control px-3 text-dense text-ink no-underline hover:bg-sunken">
              {s.label}
            </a>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <LanguageSwitch locale={locale} />
        {me ? (
          <Link href={homeHref} className={buttonVariants({ variant: isLanding ? "secondary" : "primary" })}>
            {t(locale, "shell.goHome")}
          </Link>
        ) : (
          <>
            <Link href={`/${locale}/login/staff`} className={buttonVariants({ variant: "quiet", className: "hidden md:inline-flex" })}>
              {t(locale, "shell.staffSignIn")}
            </Link>
            <Link href={`/${locale}/triage`} className={buttonVariants({ variant: isLanding ? "secondary" : "primary", className: "hidden md:inline-flex" })}>
              {t(locale, "shell.describeProblem")}
            </Link>
          </>
        )}
        {isLanding && (
          <div className="lg:hidden">
            <MobileMenu locale={locale} signedIn={!!me} sections={sections} />
          </div>
        )}
      </div>
    </header>
  );
}
