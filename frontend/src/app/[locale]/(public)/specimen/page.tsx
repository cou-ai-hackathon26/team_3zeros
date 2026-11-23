import React from "react";
import { notFound } from "next/navigation";
import tokens from "../../../../tokens/tokens.json";

// Development-only type specimen (REDESIGN_IMPLEMENTATION_PLAN Phase 1).
// Shows every DESIGN_SYSTEM §3.2 scale step in both scripts, plus tabular
// figures in both digit sets. Replaced by the Storybook catalogue in Phase 2.
const SAMPLES = {
  bn: "আপনার কী সমস্যা হচ্ছে, বলুন। সন্তান ক্লিনিক্যাল রেফারেল",
  en: "Tell us what is wrong. Referral accepted by the district hospital",
} as const;
const DIGITS = { bn: "০১২৩৪৫৬৭৮৯ ১১১১১ ৮৮৮৮৮", en: "0123456789 11111 88888" } as const;

// Full class names so Tailwind can see them at build time.
const STEP_CLASS: Record<string, string> = {
  display: "font-serif text-display",
  title: "font-serif text-title",
  heading: "font-sans text-heading",
  subheading: "font-sans text-subheading",
  body: "font-sans text-body",
  dense: "font-sans text-dense",
  caption: "font-sans text-caption",
  code: "font-sans text-code tabular-nums",
};

export default function SpecimenPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const steps = Object.entries(tokens.primitive.text);
  return (
    <main className="mx-auto max-w-[960px] bg-paper p-6 text-ink">
      <h1 className="font-serif text-title">Type specimen</h1>
      {steps.map(([name, t]) => (
        <section key={name} data-step={name} className="border-b border-line py-4">
          <p className="font-sans text-caption text-ink-muted">
            {name}: {t.family}, {t.sizeMobile} / {t.sizeDesktop}, weight {t.weight}
          </p>
          {(["bn", "en"] as const).map((lang) => (
            <p
              key={lang}
              lang={lang}
              className={STEP_CLASS[name]}
              style={{ fontWeight: Number(t.weight) }}
            >
              {name === "code" ? DIGITS[lang] : SAMPLES[lang]}
            </p>
          ))}
          <p lang="bn" className="font-sans text-body tabular-nums">
            {DIGITS.bn} / {DIGITS.en}
          </p>
        </section>
      ))}
    </main>
  );
}
