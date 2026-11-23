"use client";

import "../../i18n/auth";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { Mark, Wordmark } from "../shell/Mark";
import { BlurFade } from "../marketing/BlurFade";

/** Static three-segment preview. Decorative: the real HandoverTracker is only used for a real case. */
function BrandTracker({ labels }: { labels: string[] }) {
  return (
    <ol aria-hidden className="m-0 flex list-none gap-1 p-0 text-caption">
      {labels.map((label, i) => (
        <li key={label} className={`flex-1 border-t-4 px-2 py-2 ${i === 0 ? "border-paddy text-brand-foreground" : "border-indigo text-brand-foreground/80"}`}>
          {label}
        </li>
      ))}
    </ol>
  );
}

/**
 * Split layout for every auth screen (AUTH_RBAC §3): brand panel at lg+, the form is the
 * page on a phone. No application navigation. The panel is static (no motion).
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  const locale = usePageLocale(undefined, "bn");
  const pathname = usePathname() ?? "";
  const staff = /\/(login\/staff|access|not-authorised)/.test(pathname);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[5fr_7fr]">
      <aside className="hidden flex-col justify-between bg-brand p-10 text-brand-foreground lg:flex">
        <div className="flex items-center gap-2">
          <Mark tile className="size-8" />
          <span className="text-subheading font-semibold">Medi Waypoint</span>
        </div>
        <div className="flex max-w-sm flex-col gap-6">
          <p className="m-0 font-serif text-title">{t(locale, staff ? "auth.brand.staffLine" : "auth.brand.patientLine")}</p>
          <BrandTracker
            labels={
              staff
                ? [t(locale, "auth.brand.sender"), t(locale, "auth.brand.receiver"), t(locale, "auth.brand.returned")]
                : [t(locale, "auth.brand.you"), t(locale, "auth.brand.doctor"), t(locale, "auth.brand.hospital")]
            }
          />
        </div>
        <p className="m-0 text-dense">{t(locale, staff ? "auth.staff.privacy" : "auth.patient.privacy")}</p>
      </aside>

      <div className="flex flex-col px-4 py-4 lg:px-12 lg:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/${locale}`} className="no-underline lg:invisible" aria-label="Medi Waypoint">
            <Wordmark />
          </Link>
          <LanguageSwitch locale={locale} />
        </div>
        <main id="main" className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6 py-8">
          <BlurFade duration={0.25}>
            {children}
          </BlurFade>
        </main>
      </div>
    </div>
  );
}
