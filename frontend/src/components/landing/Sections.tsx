import React from "react";
import { Check, Minus } from "lucide-react";
import type { Locale } from "../../i18n/config";
import { t } from "../../i18n/format";
import { buttonVariants } from "../ui/button";
import { Alert } from "../ui/states";
import { ListRow, Tile } from "../ui/surfaces";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { cn } from "../../lib/cn";
import type { LandingClaims } from "./LandingPage";

const wrap = "mx-auto w-full max-w-[1200px] px-4";
const sectionPad = "py-8 md:py-12"; // adjacent sections add up to 64px (phone) and 96px (md+)

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} tabIndex={-1} className="m-0 font-serif text-title outline-none">{children}</h2>;
}

/** #why: three plain statements, no icons, no cards (LANDING §4.2). No numbers: the repository has no measured figures. */
export function Problem({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.problem.${k}`);
  return (
    <section id="why" aria-labelledby="why-title" className={cn(wrap, sectionPad)}>
      <SectionTitle id="why-title">{L("title")}</SectionTitle>
      <div className="mt-8 grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {(["which", "records", "word"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2 py-6 md:px-8 md:py-0 md:first:ps-0 md:last:pe-0">
            <h3 className="m-0 text-heading font-semibold">{L(`items.${k}.h`)}</h3>
            <p className="m-0 text-body text-ink-muted">{L(`items.${k}.p`)}</p>
          </div>
        ))}
      </div>
      <p className="m-0 mt-8 text-subheading font-semibold">{L("closing")}</p>
    </section>
  );
}

/** #how: the patient journey in four steps beside a handover rail (static here; E3 comes with the effects). */
export function How({ locale }: { locale: Locale }) {
  const L = (k: string) => t(locale, `landing.how.${k}`);
  const holders = ["patient", "patient", "patient", "practitioner"] as const;
  const visual: Record<string, React.ReactNode> = {
    tell: (
      <div className="flex max-w-sm flex-col gap-1 rounded-panel border border-line bg-surface p-3 text-dense">
        <p className="m-0 text-caption text-ink-muted">{L("steps.tell.sample")}</p>
        <p className="m-0 font-medium">{L("steps.tell.assistant")}</p>
        <p className="m-0 text-ink-muted">{L("steps.tell.patient")}</p>
      </div>
    ),
    check: (
      <div className="flex max-w-sm flex-col gap-1 rounded-panel border border-line bg-surface p-3 text-dense">
        <p className="m-0">{L("steps.check.sample")}</p>
        <p className="m-0 text-caption font-semibold text-indigo">{t(locale, "patient.changedByYou")}</p>
      </div>
    ),
    choose: (
      <ul className="m-0 max-w-sm list-none rounded-panel border border-line bg-surface px-3 p-0">
        <ListRow title={t(locale, "landing.hero.sampleDoctor")} meta={L("steps.choose.sampleSpecialty")} trailing={L("steps.choose.sampleSlot")} />
      </ul>
    ),
    decide: <StatusBadge entity="appointment" state="REQUESTED" tone="active" locale={locale} />,
  };
  return (
    <section id="how" aria-labelledby="how-title" className={cn(wrap, sectionPad)}>
      <SectionTitle id="how-title">{L("title")}</SectionTitle>
      <ol className="m-0 mt-8 flex list-none flex-col p-0">
        {(["tell", "check", "choose", "decide"] as const).map((k, i) => (
          <li key={k} className="grid gap-2 border-s-4 border-indigo ps-5 pb-10 last:pb-0 md:grid-cols-[10rem_1fr] md:gap-6">
            <p className="m-0 text-caption font-semibold text-ink-muted">{t(locale, `holderName.${holders[i]}`)}</p>
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-heading font-semibold">{L(`steps.${k}.title`)}</h3>
              <p className="m-0 max-w-xl text-body text-ink-muted">{L(`steps.${k}.text`)}</p>
              {visual[k]}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 max-w-2xl">
        <Alert tone="attention" title={L("alert")} />
      </div>
    </section>
  );
}

/** #features: bento, six tiles sized by importance; the two conditional tiles follow deployment facts (LANDING §4.4). */
export function Features({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.features.${k}`);
  const tile = (k: string) => (
    <>
      <h3 className="m-0 text-heading font-semibold">{L(`tiles.${k}.title`)}</h3>
      <p className="m-0 mt-2 text-body">{L(`tiles.${k}.text`)}</p>
    </>
  );
  const a = claims.voice ? "voice" : "typed";
  return (
    <section id="features" aria-labelledby="features-title" className={cn(wrap, sectionPad)}>
      <SectionTitle id="features-title">{L("title")}</SectionTitle>
      {/* DOM order is the phone order: A, B, C, E, D, F. Large screens place tiles explicitly. */}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        <Tile tone="wash" className="md:col-span-2 lg:order-1 lg:col-span-7 lg:row-span-2">
          {tile(a)}
          <p className="m-0 mt-4 max-w-sm rounded-panel bg-surface p-3 text-dense text-ink">{t(locale, "landing.how.steps.tell.patient")}</p>
        </Tile>
        <Tile className="lg:order-2 lg:col-span-5">
          {tile("track")}
          <div className="mt-4"><StatusBadge entity="appointment" state="REQUESTED" tone="active" locale={locale} /></div>
        </Tile>
        <Tile className="lg:order-3 lg:col-span-5">{tile("consent")}</Tile>
        <Tile tone="brand" className="lg:order-5 lg:col-span-8">
          {tile("loop")}
          <ol aria-hidden className="m-0 mt-4 flex list-none gap-1 p-0 text-caption">
            {(["sender", "receiver", "returned"] as const).map((s, i) => (
              <li key={s} className={cn("flex-1 border-t-4 px-2 py-2", i === 2 ? "border-paddy" : "border-indigo")}>{L(`tiles.loop.${s}`)}</li>
            ))}
          </ol>
        </Tile>
        <Tile className="lg:order-4 lg:col-span-4">
          {tile("reports")}
          <div className="mt-4"><StatusBadge entity="document" state="EXTRACTED_UNVERIFIED" tone="draft" locale={locale} /></div>
        </Tile>
        {claims.offlineEmergency && <Tile className="md:col-span-2 lg:order-6 lg:col-span-12">{tile("emergency")}</Tile>}
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

/** #safety: only statements the repository supports and whose publishing condition is met (LANDING §4.5). */
export function Safety({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const L = (k: string) => t(locale, `landing.safety.${k}`);
  const does = Object.entries(SAFETY_GATES).filter(([, gate]) => !gate || claims[gate]).map(([k]) => k);
  return (
    <section id="safety" aria-labelledby="safety-title" className={cn(wrap, sectionPad)}>
      <SectionTitle id="safety-title">{L("title")}</SectionTitle>
      <div className="mt-8 grid gap-8 rounded-tile border border-line bg-surface p-6 md:grid-cols-2 md:p-8">
        <div>
          <h3 className="m-0 mb-4 text-heading font-semibold">{L("doesTitle")}</h3>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {does.map((k) => (
              <li key={k} className="flex items-start gap-3 text-body">
                <Check aria-hidden className="mt-1 size-5 shrink-0 text-positive" />
                <span>{L(`does.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="m-0 mb-4 text-heading font-semibold">{L("doesNotTitle")}</h3>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(["emergency", "doctor", "training"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3 text-body">
                <Minus aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" />
                <span>{L(`doesNot.${k}`)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-4 text-dense text-ink-muted">{t(locale, "patient.automatedGuideNotice")}</p>
        </div>
      </div>
    </section>
  );
}

/** #for-doctors: two panels that look like the two interfaces (LANDING §4.6). The staff action is sign-in, not sign-up. */
export function Audiences({ locale, claims }: { locale: Locale; claims: LandingClaims }) {
  const P = (k: string) => t(locale, `landing.audiences.patient.${k}`);
  const S = (k: string) => t(locale, `landing.audiences.staff.${k}`);
  return (
    <section id="for-doctors" aria-labelledby="for-doctors-title" className={cn(wrap, sectionPad)}>
      <h2 id="for-doctors-title" className="sr-only">{S("title")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-tile bg-accent p-6 md:p-8">
          <h3 className="m-0 font-serif text-title">{P("title")}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body">
            {(["words", "find", "see", "control"] as const).map((k) => <li key={k}>{P(`points.${k}`)}</li>)}
          </ul>
          <a href={`/${locale}/triage${claims.voice ? "?mode=voice" : ""}`} className={buttonVariants({ size: "lg", className: "w-full sm:w-fit" })}>
            {claims.voice ? t(locale, "patient.startTalking") : t(locale, "shell.describeProblem")}
          </a>
        </div>
        <div className="flex flex-col gap-4 rounded-tile border border-line bg-surface p-6 md:p-8">
          <h3 className="m-0 text-heading font-semibold">{S("title")}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-dense">
            {(["queue", "drafts", "ack", "emergency"] as const)
             
              .map((k) => <li key={k}>{S(`points.${k}`)}</li>)}
          </ul>
          <div className="flex flex-col items-start gap-3">
            <a href={`/${locale}/login/staff`} className={buttonVariants({ variant: "secondary" })}>{t(locale, "shell.staffSignIn")}</a>
            <a href={`/${locale}/access`} className="text-dense text-indigo underline underline-offset-2">{S("access")}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
