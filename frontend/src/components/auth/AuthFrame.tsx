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
    <ol aria-hidden className="m-0 grid list-none grid-cols-3 gap-2 p-0 text-caption">
      {labels.map((label, i) => (
        <li
          key={label}
          className={`flex flex-col gap-2 rounded-panel border px-3 py-2.5 font-medium ${
            i === 0
              ? "border-paddy/40 bg-paddy/10 text-paddy"
              : "border-surface/15 bg-surface/5 text-brand-foreground/85"
          }`}
        >
          <span className={`h-1 w-full rounded-pill ${i === 0 ? "bg-paddy" : "bg-indigo"}`} />
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Split layout for every auth screen (AUTH_RBAC §3): calm brand panel at lg+, clean card
 * surface on warm paper. No application navigation. The panel is static (no motion).
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  const locale = usePageLocale(undefined, "bn");
  const pathname = usePathname() ?? "";
  const staff = /\/(login\/staff|admin\/login|access|not-authorised)/.test(pathname);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[5fr_7fr]">
      <aside className="hidden flex-col justify-between bg-brand p-10 text-brand-foreground lg:flex lg:p-12">
        <Link href={`/${locale}`} className="inline-flex w-fit items-center gap-2.5 text-brand-foreground no-underline transition-opacity hover:opacity-85">
          <Mark tile className="size-8" />
          <span className="text-subheading font-semibold">Medi Waypoint</span>
        </Link>
        <div className="flex max-w-md flex-col gap-7">
          <p className="m-0 font-serif text-title tracking-[-0.02em] text-balance">
            {t(locale, staff ? "auth.brand.staffLine" : "auth.brand.patientLine")}
          </p>
          <BrandTracker
            labels={
              staff
                ? [t(locale, "auth.brand.sender"), t(locale, "auth.brand.receiver"), t(locale, "auth.brand.returned")]
                : [t(locale, "auth.brand.you"), t(locale, "auth.brand.doctor"), t(locale, "auth.brand.hospital")]
            }
          />
        </div>
        <p className="m-0 max-w-sm text-dense leading-relaxed text-brand-foreground/80">
          {t(locale, staff ? "auth.staff.privacy" : "auth.patient.privacy")}
        </p>
      </aside>

      <div className="flex flex-col px-4 py-4 sm:px-6 lg:px-12 lg:py-8">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3.5 lg:border-b-0 lg:pb-0">
          <Link href={`/${locale}`} className="no-underline transition-opacity hover:opacity-80 lg:invisible" aria-label="Medi Waypoint">
            <Wordmark />
          </Link>
          <LanguageSwitch locale={locale} />
        </div>
        <main id="main" className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-8 sm:py-12">
          <BlurFade duration={0.25} className="rounded-[24px] bg-surface p-6 sm:p-8 lg:border lg:border-line/70">
            {children}
          </BlurFade>
        </main>
      </div>
    </div>
  );
}
