import "../../i18n/landing";
import React from "react";
import { ArrowRight, Check, Mic } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { buttonVariants } from "../ui/button";
import { BlurText } from "../marketing/BlurText";
import { PhoneMockup } from "./PhoneMockup";
import type { LandingClaims } from "./LandingPage";

/** Hero: two-column modern layout pairing the headline & action with a realistic mobile product preview (LANDING §4.1). */
export function Hero({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.${k}`);
  const base = `/${locale}/triage`;
  // Voice is named only where the deployment has it (Q-05). Otherwise there is one plain action.
  const primary = claims.voice
    ? { label: t(locale, "patient.startTalking"), href: `${base}?mode=voice` }
    : { label: t(locale, "shell.describeProblem"), href: base };

  const cues = ["words", "see", "control"] as const;

  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-x-clip bg-paper"
    >
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div className="flex flex-col gap-6">
          <h1
            id="hero-title"
            className="m-0 font-serif text-display tracking-[-0.025em] text-balance text-ink"
          >
            <BlurText text={L("hero.headline")} />
          </h1>

          <p className="m-0 max-w-xl text-body leading-relaxed text-ink-muted sm:text-subheading">
            {L("hero.text")}
          </p>

          <div id="hero-cta" className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href={primary.href}
              className={buttonVariants({
                size: "lg",
                className: "group w-full sm:w-auto",
              })}
            >
              {claims.voice && <Mic aria-hidden className="size-5 shrink-0" />}
              <span>{primary.label}</span>
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
                className={buttonVariants({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                {t(locale, "patient.typeInstead")}
              </a>
            )}
          </div>

          {/* Always directly under the buttons. No emergency numbers: they wait on Q-06. */}
          <p className="m-0 max-w-xl text-dense text-ink-muted">
            {t(locale, "patient.automatedGuideNotice")}
          </p>

          {/* Grounded capability cues drawn from existing patient copy (zero fabricated metrics). */}
          <ul className="m-0 mt-3 grid list-none gap-3 border-t border-line p-0 pt-6 sm:grid-cols-3 sm:gap-5">
            {cues.map((k) => (
              <li key={k} className="flex items-start gap-2.5 text-dense text-ink-muted">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-positive-wash text-positive">
                  <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                </span>
                <span className="leading-snug text-ink">{L(`audiences.patient.points.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[2rem] bg-sunken px-4 py-8 sm:px-8 sm:py-10">
          <PhoneMockup
            locale={locale}
            doctor={L("hero.sampleDoctor")}
            facility={L("hero.sampleFacility")}
            purpose={L("hero.samplePurpose")}
            categories={[L("hero.sampleCategoryVisit"), L("hero.sampleCategoryLabs")]}
            sampleCaption={L("hero.sample")}
          />
        </div>
      </div>
    </section>
  );
}
