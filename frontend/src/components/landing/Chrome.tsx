import React from "react";
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
    <section aria-labelledby="final-title" className="bg-brand text-brand-foreground" style={{ backgroundImage: "radial-gradient(var(--color-indigo) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-4 py-16 text-center md:items-start md:py-24 md:text-start">
        <h2 id="final-title" className="m-0 font-serif text-display">{t(locale, "landing.final.title")}</h2>
        <p className="m-0 max-w-xl text-body">{t(locale, "landing.final.text")}</p>
        <div id="final-cta" className="flex flex-col items-center gap-3 sm:flex-row">
          <a href={claims.voice ? `${base}?mode=voice` : base} className={buttonVariants({ variant: "on-brand", size: "lg" })}>
            {claims.voice ? t(locale, "patient.startTalking") : t(locale, "shell.describeProblem")}
          </a>
          {claims.voice && <a href={`${base}?mode=text`} className="text-body text-brand-foreground underline underline-offset-2">{t(locale, "patient.typeInstead")}</a>}
        </div>
        <p className="m-0 max-w-xl text-dense">{t(locale, "patient.automatedGuideNotice")}</p>
      </div>
    </section>
  );
}

/**
 * Footer. The privacy notice, terms, contact, operator name and service area are not in the
 * repository, so those items are not rendered at all (LANDING §4.8, §9). No placeholders.
 */
export function Footer({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.footer.${k}`);
  const link = "text-dense text-ink no-underline hover:underline";
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-subheading font-semibold"><Mark />Medi Waypoint</span>
          <p className="m-0 max-w-xs text-dense text-ink-muted">{L("description")}</p>
        </div>
        <nav aria-label={L("patients")} className="flex flex-col gap-2">
          <p className="m-0 text-dense font-semibold">{L("patients")}</p>
          <a className={link} href={`/${locale}/triage`}>{t(locale, "shell.describeProblem")}</a>
          <a className={link} href={`/${locale}/doctors`}>{t(locale, "patient.findDoctor")}</a>
          <a className={link} href={`/${locale}/login`}>{L("patientSignIn")}</a>
        </nav>
        <nav aria-label={L("staff")} className="flex flex-col gap-2">
          <p className="m-0 text-dense font-semibold">{L("staff")}</p>
          <a className={link} href={`/${locale}/login/staff`}>{t(locale, "shell.staffSignIn")}</a>
          <a className={link} href={`/${locale}/access`}>{t(locale, "landing.audiences.staff.access")}</a>
        </nav>
        <nav aria-label={L("about")} className="flex flex-col gap-2">
          <p className="m-0 text-dense font-semibold">{L("about")}</p>
          <a className={link} href="#how">{t(locale, "landing.nav.how")}</a>
          <a className={link} href="#safety">{t(locale, "landing.nav.safety")}</a>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 border-t border-line px-4 py-4">
        <span className="text-dense text-ink-muted">{L("bottom")}</span>
        <LanguageSwitch locale={locale} />
      </div>
    </footer>
  );
}
