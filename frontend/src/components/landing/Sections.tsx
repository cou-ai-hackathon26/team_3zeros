import "../../i18n/landing";
import React from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  FileCheck2,
  FilePenLine,
  MessageSquareText,
  Mic,
  Minus,
  Route,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { buttonVariants } from "../ui/button";
import { Alert } from "../ui/states";
import { ListRow, Tile } from "../ui/surfaces";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { BlurFade } from "../marketing/BlurFade";
import { TracingBeam } from "../marketing/TracingBeam";
import { cn } from "../../lib/cn";
import type { LandingClaims } from "./LandingPage";

const wrap = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";
const sectionPad = "py-16 md:py-24";

function SectionTitle({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      tabIndex={-1}
      className={cn(
        "m-0 font-serif text-title tracking-[-0.025em] text-balance text-ink outline-none md:text-[36px] md:leading-[1.15] xl:text-[40px]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Subtle architectural curve inspired by Life Care's calm full-bleed vector wave. */
function EditorialWave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 120"
      fill="none"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-10 -z-0 h-28 w-full opacity-55"
    >
      <path
        d="M0 78C260 18 520 118 820 56C1060 8 1260 44 1440 24"
        className="stroke-line"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** #why: Life Care-inspired airy editorial pillar grid on warm cream ground (LANDING §4.2). No fabricated figures. */
export function Problem({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.problem.${k}`);
  return (
    <section id="why" aria-labelledby="why-title" className="relative overflow-hidden bg-paper">
      <EditorialWave />
      <div className={cn(wrap, sectionPad, "relative z-10")}>
        <div className="border-t border-line pt-12 md:pt-16">
          <SectionTitle id="why-title">{L("title")}</SectionTitle>
          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
            {(["which", "records", "word"] as const).map((k, i) => (
              <BlurFade key={k} delay={i * 0.08} className="flex flex-col gap-3.5">
                <span aria-hidden="true" className="h-1 w-10 rounded-pill bg-indigo/35" />
                <h3 className="m-0 text-heading font-semibold text-ink">{L(`items.${k}.h`)}</h3>
                <p className="m-0 text-body leading-relaxed text-ink-muted">{L(`items.${k}.p`)}</p>
              </BlurFade>
            ))}
          </div>
          <div className="mt-12">
            <p className="m-0 inline-flex items-center rounded-pill bg-sunken px-6 py-3 text-subheading font-semibold text-ink">
              {L("closing")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #how: alternating soft linen band (.section--alt) hosting the 4-step patient handover journey. */
export function How({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.how.${k}`);
  const holders = ["patient", "patient", "patient", "practitioner"] as const;
  const visual: Record<string, React.ReactNode> = {
    tell: (
      <div className="flex max-w-md flex-col gap-2.5 rounded-[22px] bg-surface p-5">
        <span className="text-caption font-medium text-ink-muted">{L("steps.tell.sample")}</span>
        <p className="m-0 max-w-[85%] rounded-panel bg-sunken px-3.5 py-2.5 text-dense font-medium text-ink">
          {L("steps.tell.assistant")}
        </p>
        <p className="m-0 ms-auto max-w-[85%] rounded-panel bg-indigo-wash px-3.5 py-2.5 text-dense text-ink">
          {L("steps.tell.patient")}
        </p>
      </div>
    ),
    check: (
      <div className="flex max-w-md flex-col gap-3 rounded-[22px] bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="m-0 text-body font-medium text-ink">{L("steps.check.sample")}</p>
          <FilePenLine aria-hidden className="mt-0.5 size-4 shrink-0 text-indigo" />
        </div>
        <p className="m-0 w-fit rounded-pill bg-indigo-wash px-3 py-1 text-caption font-semibold text-indigo">
          {t(locale, "patient.changedByYou")}
        </p>
      </div>
    ),
    choose: (
      <ul className="m-0 max-w-md list-none rounded-[22px] bg-surface px-5 py-1.5 p-0 [&>li>div]:border-b-0">
        <ListRow
          title={t(locale, "landing.hero.sampleDoctor")}
          meta={L("steps.choose.sampleSpecialty")}
          trailing={
            <span className="inline-flex rounded-pill bg-sunken px-3 py-1 text-caption font-medium text-ink">
              {L("steps.choose.sampleSlot")}
            </span>
          }
        />
      </ul>
    ),
    decide: (
      <div className="inline-flex w-fit items-center rounded-pill bg-surface px-5 py-3">
        <StatusBadge entity="appointment" state="REQUESTED" tone="active" locale={locale} />
      </div>
    ),
  };

  return (
    <section id="how" aria-labelledby="how-title" className="bg-sunken">
      <div className={cn(wrap, sectionPad)}>
        <SectionTitle id="how-title">{L("title")}</SectionTitle>
        <TracingBeam className="mt-12 md:ms-6">
          <ol className="m-0 flex list-none flex-col p-0">
            {(["tell", "check", "choose", "decide"] as const).map((k, i) => (
              <li
                key={k}
                className="group grid gap-3 border-s-4 border-indigo/75 ps-5 pb-12 last:pb-0 md:grid-cols-[11rem_1fr] md:gap-8 md:border-s-0 md:ps-0"
              >
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-2 rounded-pill bg-surface px-3.5 py-1.5 text-caption font-semibold text-ink-muted ring-1 ring-line/60 transition-colors duration-[var(--motion-state-duration)] group-hover:ring-indigo/40">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 rounded-pill ring-4",
                        holders[i] === "practitioner"
                          ? "bg-positive ring-positive-wash"
                          : "bg-indigo ring-indigo-wash",
                      )}
                    />
                    {t(locale, `holderName.${holders[i]}`)}
                  </span>
                </div>
                <BlurFade delay={i * 0.06} className="flex flex-col gap-3.5">
                  <h3 className="m-0 text-heading font-semibold text-ink">{L(`steps.${k}.title`)}</h3>
                  <p className="m-0 max-w-xl text-body leading-relaxed text-ink-muted">{L(`steps.${k}.text`)}</p>
                  <div className="transition-transform duration-[var(--motion-state-duration)] ease-[var(--motion-state-easing)] group-hover:-translate-y-0.5">
                    {visual[k]}
                  </div>
                </BlurFade>
              </li>
            ))}
          </ol>
        </TracingBeam>
        <div className="mt-12 max-w-2xl">
          <Alert tone="attention" title={L("alert")} />
        </div>
      </div>
    </section>
  );
}

/** #features: calm tonal bento grid on warm cream ground inspired by Life Care's asymmetric showcase (LANDING §4.4). */
export function Features({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.features.${k}`);
  const tileCopy = (k: string, inverted = false) => (
    <>
      <h3 className={cn("m-0 text-heading font-semibold", inverted ? "text-brand-foreground" : "text-ink")}>
        {L(`tiles.${k}.title`)}
      </h3>
      <p className={cn("m-0 mt-2.5 text-body leading-relaxed", inverted ? "text-brand-foreground/85" : "text-ink-muted")}>
        {L(`tiles.${k}.text`)}
      </p>
    </>
  );
  const a = claims.voice ? "voice" : "typed";
  const tileMotion =
    "transition-transform duration-[var(--motion-state-duration)] ease-[var(--motion-state-easing)] hover:-translate-y-0.5";

  return (
    <section id="features" aria-labelledby="features-title" className="bg-paper">
      <div className={cn(wrap, sectionPad)}>
        <SectionTitle id="features-title">{L("title")}</SectionTitle>
        {/* DOM order is the phone order: A, B, C, E, D, F. Large screens place tiles explicitly. */}
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-12">
          <Tile
            tone="wash"
            className={cn(
              "flex flex-col justify-between gap-6 border-0 p-7 sm:p-8 md:col-span-2 lg:order-1 lg:col-span-7 lg:row-span-2",
              tileMotion,
            )}
          >
            <div>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-pill bg-surface text-indigo">
                {claims.voice ? <Mic aria-hidden className="size-5" /> : <MessageSquareText aria-hidden className="size-5" />}
              </span>
              {tileCopy(a)}
            </div>
            <div className="flex max-w-md flex-col gap-2 rounded-[20px] bg-surface p-5 text-dense text-ink">
              <p className="m-0 text-caption font-medium text-ink-muted">
                {t(locale, "landing.how.steps.tell.assistant")}
              </p>
              <p className="m-0 font-medium text-ink">{t(locale, "landing.how.steps.tell.patient")}</p>
            </div>
          </Tile>

          <Tile className={cn("flex flex-col justify-between gap-5 border-0 bg-sunken p-7 lg:order-2 lg:col-span-5", tileMotion)}>
            <div>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-pill bg-surface text-indigo">
                <Route aria-hidden className="size-5" />
              </span>
              {tileCopy("track")}
            </div>
            <div>
              <StatusBadge entity="appointment" state="REQUESTED" tone="active" locale={locale} />
            </div>
          </Tile>

          <Tile className={cn("flex flex-col justify-between gap-5 border-0 bg-sunken p-7 lg:order-3 lg:col-span-5", tileMotion)}>
            <div>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-pill bg-surface text-positive">
                <ShieldCheck aria-hidden className="size-5" />
              </span>
              {tileCopy("consent")}
            </div>
          </Tile>

          <Tile
            tone="brand"
            className={cn(
              "flex flex-col justify-between gap-6 p-7 sm:p-8 lg:order-5 lg:col-span-8",
              tileMotion,
            )}
          >
            <div>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-pill bg-surface/10 text-paddy">
                <ArrowLeftRight aria-hidden className="size-5" />
              </span>
              {tileCopy("loop", true)}
            </div>
            <ol aria-hidden className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 text-caption sm:grid-cols-3">
              {(["sender", "receiver", "returned"] as const).map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "flex flex-col gap-2 rounded-panel border px-3.5 py-3 font-medium",
                    i === 2
                      ? "border-paddy/40 bg-paddy/10 text-paddy"
                      : "border-surface/15 bg-surface/5 text-brand-foreground/90",
                  )}
                >
                  <span
                    className={cn(
                      "h-1 w-full rounded-pill",
                      i === 2 ? "bg-paddy" : "bg-indigo",
                    )}
                  />
                  <span>{L(`tiles.loop.${s}`)}</span>
                </li>
              ))}
            </ol>
          </Tile>

          <Tile className={cn("flex flex-col justify-between gap-5 border-0 bg-sunken p-7 lg:order-4 lg:col-span-4", tileMotion)}>
            <div>
              <span className="mb-5 inline-flex size-11 items-center justify-center rounded-pill bg-surface text-ochre">
                <FileCheck2 aria-hidden className="size-5" />
              </span>
              {tileCopy("reports")}
            </div>
            <div>
              <StatusBadge entity="document" state="EXTRACTED_UNVERIFIED" tone="draft" locale={locale} />
            </div>
          </Tile>

          {claims.offlineEmergency && (
            <Tile className={cn("flex flex-col gap-4 border-0 bg-sunken p-7 sm:p-8 md:col-span-2 lg:order-6 lg:col-span-12", tileMotion)}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-signal-wash text-signal">
                  <WifiOff aria-hidden className="size-5" />
                </span>
                <div>{tileCopy("emergency")}</div>
              </div>
            </Tile>
          )}
        </div>
      </div>
    </section>
  );
}

const SAFETY_GATES: Record<string, keyof LandingClaims | null> = {
  automated: null,
  rules: "rulesApproved", // Q-06: the rule set is still a marked placeholder
  consent: "consentWordingApproved", // Q-07
  audit: null,
  approval: null,
  code: "otpIsReal", // audit A-02: the code is currently a fixed test value
};

/** #safety: calm alternating linen band with clear positive guarantees vs boundaries (LANDING §4.5). */
export function Safety({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.safety.${k}`);
  const does = Object.entries(SAFETY_GATES)
    .filter(([, gate]) => !gate || claims[gate])
    .map(([k]) => k);
  return (
    <section id="safety" aria-labelledby="safety-title" className="bg-sunken">
      <div className={cn(wrap, sectionPad)}>
        <SectionTitle id="safety-title">{L("title")}</SectionTitle>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-[24px] bg-surface p-7 sm:p-9">
            <h3 className="m-0 text-heading font-semibold text-ink">{L("doesTitle")}</h3>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {does.map((k) => (
                <li key={k} className="flex items-start gap-3 text-body leading-relaxed text-ink">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-pill bg-positive-wash text-positive">
                    <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                  </span>
                  <span>{L(`does.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-6 rounded-[24px] bg-paper p-7 sm:p-9">
            <div className="flex flex-col gap-5">
              <h3 className="m-0 text-heading font-semibold text-ink">{L("doesNotTitle")}</h3>
              <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                {(["emergency", "doctor", "training"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-3 text-body leading-relaxed text-ink">
                    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-muted">
                      <Minus aria-hidden className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <span>{L(`doesNot.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="m-0 border-t border-line pt-4 text-dense leading-relaxed text-ink-muted">
              {t(locale, "patient.automatedGuideNotice")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #for-doctors: balanced 6:6 split on warm cream ground echoing Life Care's audience cards (LANDING §4.6). */
export function Audiences({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const P = (k: string) => t(locale, `landing.audiences.patient.${k}`);
  const S = (k: string) => t(locale, `landing.audiences.staff.${k}`);
  return (
    <section id="for-doctors" aria-labelledby="for-doctors-title" className="relative overflow-hidden bg-paper">
      <EditorialWave />
      <div className={cn(wrap, sectionPad, "relative z-10")}>
        <h2 id="for-doctors-title" className="sr-only">
          {S("title")}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-7 rounded-[28px] bg-indigo-wash p-8 sm:p-10">
            <div className="flex flex-col gap-5">
              <h3 className="m-0 font-serif text-title tracking-[-0.02em] text-ink">{P("title")}</h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-body text-ink">
                {(["words", "find", "see", "control"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface text-indigo">
                      <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <span>{P(`points.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <a
                href={`/${locale}/triage${claims.voice ? "?mode=voice" : ""}`}
                className={buttonVariants({
                  size: "lg",
                  className: "group w-full sm:w-fit",
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
            </div>
          </div>

          <div className="flex flex-col justify-between gap-7 rounded-[28px] bg-sunken p-8 sm:p-10">
            <div className="flex flex-col gap-5">
              <h3 className="m-0 text-heading font-semibold text-ink">{S("title")}</h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-dense leading-relaxed text-ink">
                {(["queue", "drafts", "ack", "emergency"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-pill bg-indigo" />
                    <span>{S(`points.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href={`/${locale}/login/staff`}
                className={buttonVariants({
                  variant: "secondary",
                  size: "md",
                })}
              >
                {t(locale, "shell.staffSignIn")}
              </a>
              <a
                href={`/${locale}/access`}
                className="group inline-flex min-h-11 items-center gap-1.5 text-dense font-semibold text-indigo underline underline-offset-4 transition-colors hover:text-indigo-hover"
              >
                <span>{S("access")}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3.5 shrink-0 transition-transform duration-[var(--motion-state-duration)] group-hover:translate-x-1"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
