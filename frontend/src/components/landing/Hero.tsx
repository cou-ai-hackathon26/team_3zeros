import "../../i18n/landing";
import React from "react";
import { Mic } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { buttonVariants } from "../ui/button";
import { HandoverTracker } from "../HandoverTracker/HandoverTracker";
import { ConsentPreview } from "./Client";
import type { LandingClaims } from "./LandingPage";

/** Hero: what it is and how to start, beside real components rendered with sample data (LANDING §4.1). */
export function Hero({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.${k}`);
  const base = `/${locale}/triage`;
  // Voice is named only where the deployment has it (Q-05). Otherwise there is one plain action.
  const primary = claims.voice
    ? { label: t(locale, "patient.startTalking"), href: `${base}?mode=voice` }
    : { label: t(locale, "shell.describeProblem"), href: base };

  return (
    <section aria-labelledby="hero-title" className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-[7fr_5fr] md:gap-10 lg:py-16">
      <div className="flex flex-col gap-6">
        <h1 id="hero-title" className="m-0 font-serif text-display">{L("hero.headline")}</h1>
        <p className="m-0 max-w-xl text-body text-ink-muted">{L("hero.text")}</p>
        <div id="hero-cta" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a href={primary.href} className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
            {claims.voice && <Mic aria-hidden className="size-5" />}
            {primary.label}
          </a>
          {claims.voice && (
            <a href={`${base}?mode=text`} className="text-body text-indigo underline underline-offset-2">
              {t(locale, "patient.typeInstead")}
            </a>
          )}
        </div>
        {/* Always directly under the buttons. No emergency numbers: they wait on Q-06. */}
        <p className="m-0 max-w-xl text-dense text-ink-muted">{t(locale, "patient.automatedGuideNotice")}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-tile bg-brand p-5 text-brand-foreground">
        {/* Not interactive, and removed from the tab order and the accessibility tree. */}
        <div inert aria-hidden="true" className="flex flex-col gap-4">
          <div className="rounded-panel bg-surface p-4 text-ink">
            <HandoverTracker entity="appointment" currentState="REQUESTED" objectId="landing-preview" locale={locale} holderName={L("hero.sampleDoctor")} />
          </div>
          <ConsentPreview
            locale={locale}
            doctor={L("hero.sampleDoctor")}
            facility={L("hero.sampleFacility")}
            purpose={L("hero.samplePurpose")}
            categories={[L("hero.sampleCategoryVisit"), L("hero.sampleCategoryLabs")]}
          />
        </div>
        <p className="m-0 text-caption">{L("hero.sample")}</p>
      </div>
    </section>
  );
}
