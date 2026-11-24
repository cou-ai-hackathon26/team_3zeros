import "../../i18n/landing";
import React from "react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { CLAIMS } from "../../features/flags";
import { Hero } from "./Hero";
import { Audiences, Features, GlobalExpansion, How, Problem, Safety } from "./Sections";
import { FinalCall, Footer } from "./Chrome";
import { SectionFocus, StickyStartBar } from "./Client";
import { BlurFade } from "../marketing/BlurFade";

export type LandingClaims = { -readonly [K in keyof typeof CLAIMS]: boolean };

/**
 * `/` (LANDING_PAGE_ARCHITECTURE). Server-rendered text first. Sections are final, static states:
 * the four effects (E1 to E4) are added in Phase 8 and never change what the page says.
 * Every claim is either from the project's own documents or gated by `claims`.
 */
export function LandingPage({ locale, claims = CLAIMS }: { locale: Locale; claims?: LandingClaims }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:p-3">{t(locale, "landing.skip")}</a>
      <main id="main">
        <Hero locale={locale} claims={claims} />
        <BlurFade delay={0.05}><Problem locale={locale} /></BlurFade>
        <BlurFade delay={0.05}><How locale={locale} /></BlurFade>
        <BlurFade delay={0.05}><Features locale={locale} claims={claims} /></BlurFade>
        <BlurFade delay={0.05}><Safety locale={locale} claims={claims} /></BlurFade>
        <BlurFade delay={0.05}><Audiences locale={locale} claims={claims} /></BlurFade>
        <BlurFade delay={0.05}><GlobalExpansion locale={locale} /></BlurFade>
        <BlurFade delay={0.05}><FinalCall locale={locale} claims={claims} /></BlurFade>
      </main>
      <Footer locale={locale} />
      <StickyStartBar
        href={`/${locale}/triage${claims.voice ? "?mode=voice" : ""}`}
        label={claims.voice ? t(locale, "patient.startTalking") : t(locale, "shell.describeProblem")}
      />
      <SectionFocus />
    </>
  );
}
