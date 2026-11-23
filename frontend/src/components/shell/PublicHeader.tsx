"use client";

import React from "react";
import Link from "next/link";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { landingFor } from "../../auth/access";
import { useMe } from "../../auth/me";
import { buttonVariants } from "../ui/button";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { Wordmark } from "./Mark";

/**
 * Public pages. A signed-in user sees "Go to my home" instead of the sign-in
 * links, and no staff link is shown in the signed-in state (APPLICATION_DESIGN §3).
 */
export function PublicHeader() {
  const locale = usePageLocale(undefined, "bn");
  const { me } = useMe();
  const landing = me ? landingFor(me) : null;
  const homeHref = landing?.kind === "home" ? `/${locale}${landing.path}` : `/${locale}/login/choose`;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
      <Link href={`/${locale}`} className="no-underline" aria-label="Medi Waypoint">
        <Wordmark />
      </Link>
      <nav aria-label={t(locale, "shell.mainNav")} className="flex flex-wrap items-center gap-2">
        <LanguageSwitch locale={locale} />
        {me ? (
          <Link href={homeHref} className={buttonVariants({ variant: "primary" })}>
            {t(locale, "shell.goHome")}
          </Link>
        ) : (
          <>
            <Link href={`/${locale}/login/staff`} className={buttonVariants({ variant: "quiet" })}>
              {t(locale, "shell.staffSignIn")}
            </Link>
            <Link href={`/${locale}/triage`} className={buttonVariants({ variant: "primary" })}>
              {t(locale, "shell.describeProblem")}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
