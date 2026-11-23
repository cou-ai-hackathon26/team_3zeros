import "../../i18n/landing";
import React from "react";
import { ArrowRight, Mic } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { buttonVariants } from "../ui/button";
import { LanguageSwitch } from "../LanguageSwitch/LanguageSwitch";
import { Mark } from "../shell/Mark";
import type { LandingClaims } from "./LandingPage";

/** Final call: one brand band, one next step (LANDING §4.7). The dot grid is a static CSS pattern. */
export function FinalCall({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const base = `/${locale}/triage`;
  return (
    <section
      aria-labelledby="final-title"
      className="relative overflow-hidden bg-brand text-brand-foreground"
      style={{
        backgroundImage: "radial-gradient(var(--color-indigo) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-4 py-16 text-center sm:px-6 md:items-start md:py-24 md:text-start">
        <h2
          id="final-title"
          className="m-0 max-w-2xl font-serif text-display tracking-[-0.025em] text-balance text-brand-foreground"
        >
          {t(locale, "landing.final.title")}
        </h2>
        <p className="m-0 max-w-xl text-body leading-relaxed text-brand-foreground/85 sm:text-subheading">
          {t(locale, "landing.final.text")}
        </p>
        <div id="final-cta" className="flex w-full flex-col items-center gap-3 pt-2 sm:w-auto sm:flex-row">
          <a
            href={claims.voice ? `${base}?mode=voice` : base}
            className={buttonVariants({
              variant: "on-brand",
              size: "lg",
              className: "group w-full sm:w-auto",
            })}
          >
            {claims.voice && <Mic aria-hidden className="size-5 shrink-0" />}
            <span>{claims.voice ? t(locale, "patient.startTalking") : t(locale, "shell.describeProblem")}</span>
            {!claims.voice && (
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 transition-transform duration-[var(--motion-state-duration)] group-hover:translate-x-1"
              />
            )}
          </a>
          {claims.voice && (
            <a
              href={`${base}?mode=text`}
              className="inline-flex min-h-11 items-center px-3 text-body font-medium text-brand-foreground underline underline-offset-4 transition-opacity hover:opacity-85"
            >
              {t(locale, "patient.typeInstead")}
            </a>
          )}
        </div>
        <p className="m-0 max-w-xl text-dense text-brand-foreground/75">
          {t(locale, "patient.automatedGuideNotice")}
        </p>
      </div>
    </section>
  );
}

/**
 * Footer. Soft warm linen surface inspired by Life Care's calm footer organization.
 * The privacy notice, terms, contact, operator name and service area are not in the
 * repository, so those items are not rendered at all (LANDING §4.8, §9). No placeholders.
 */
export function Footer({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.footer.${k}`);
  const link =
    "inline-flex min-h-9 items-center text-dense text-ink-muted no-underline transition-colors duration-[var(--motion-feedback-duration)] hover:text-ink hover:underline";
  return (
    <footer className="bg-sunken">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:py-20">
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2 text-subheading font-semibold text-ink">
            <Mark />
            Medi Waypoint
          </span>
          <p className="m-0 max-w-xs text-dense leading-relaxed text-ink-muted">{L("description")}</p>
        </div>
        <nav aria-label={L("patients")} className="flex flex-col gap-1.5">
          <p className="m-0 mb-1.5 text-dense font-semibold text-ink">{L("patients")}</p>
          <a className={link} href={`/${locale}/triage`}>{t(locale, "shell.describeProblem")}</a>
          <a className={link} href={`/${locale}/doctors`}>{t(locale, "patient.findDoctor")}</a>
          <a className={link} href={`/${locale}/login`}>{L("patientSignIn")}</a>
        </nav>
        <nav aria-label={L("staff")} className="flex flex-col gap-1.5">
          <p className="m-0 mb-1.5 text-dense font-semibold text-ink">{L("staff")}</p>
          <a className={link} href={`/${locale}/login/staff`}>{t(locale, "shell.staffSignIn")}</a>
          <a className={link} href={`/${locale}/access`}>{t(locale, "landing.audiences.staff.access")}</a>
        </nav>
        <nav aria-label={L("about")} className="flex flex-col gap-1.5">
          <p className="m-0 mb-1.5 text-dense font-semibold text-ink">{L("about")}</p>
          <a className={link} href="#how">{t(locale, "landing.nav.how")}</a>
          <a className={link} href="#safety">{t(locale, "landing.nav.safety")}</a>
        </nav>
      </div>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5">
          <div className="flex items-center gap-3">
            <span className="text-dense text-ink-muted">{L("bottom")}</span>
            <LanguageSwitch locale={locale} />
          </div>
        </div>
      </div>
    </footer>
  );
}
