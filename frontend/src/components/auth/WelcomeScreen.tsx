"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { useAdapters } from "../../features/adapters";
import { AreaPicker } from "../AreaPicker/AreaPicker";
import { Button, buttonVariants } from "../ui/button";
import { Field, Input } from "../ui/field";
import { RadioGroup, RadioItem } from "../ui/selection";
import { FormAlert, StepHeading, genericError } from "./FormParts";

/** Q-15 · `/welcome`. Fields are limited to columns that exist on identity.Patient. No skip until Q-15 decides. */
export function WelcomeScreen() {
  const locale = usePageLocale(undefined, "bn");
  const router = useRouter();
  const { patientProfile } = useAdapters();
  const [f, setF] = useState({ given_name: "", family_name: "", name_bn: "", birth_date: "", age: "" });
  const [sex, setSex] = useState<"female" | "male" | "other" | "">("");
  const [lang, setLang] = useState<"bn" | "en">(locale);
  const [area, setArea] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required = t(locale, "auth.error.required");
    const next: Record<string, string> = {};
    if (!f.given_name.trim()) next.given_name = required;
    if (!f.birth_date && !f.age) next.birth = required;
    if (!sex) next.sex = required;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const out = await patientProfile.submit({
        given_name: f.given_name.trim(),
        family_name: f.family_name.trim() || undefined,
        name_bn: f.name_bn.trim() || undefined,
        birth_date: f.birth_date || undefined,
        estimated_age: !f.birth_date && f.age ? Number(f.age) : undefined,
        sex: sex as "female" | "male" | "other",
        area: area ?? undefined,
        preferred_language: lang,
      });
      // Never merge or choose a duplicate in the browser (INV-13): say so and carry on.
      if (out.duplicate) setNote(t(locale, "auth.welcome.duplicate"));
      else router.replace(`/${locale}/home`);
    } catch (err) {
      setFormError(genericError(locale, err));
    } finally {
      setBusy(false);
    }
  }

  if (note) return <><StepHeading>{t(locale, "auth.welcome.title")}</StepHeading><p role="status" className="m-0 text-body">{note}</p><Link href={`/${locale}/home`} className={buttonVariants({ size: "lg" })}>{t(locale, "auth.welcome.continue")}</Link></>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <StepHeading>{t(locale, "auth.welcome.title")}</StepHeading>
        <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.welcome.help")}</p>
      </div>
      <FormAlert message={formError} />
      <Field label={t(locale, "auth.welcome.givenName")} required error={errors.given_name} locale={locale}>{(p) => <Input {...p} autoComplete="given-name" value={f.given_name} onChange={set("given_name")} />}</Field>
      <Field label={t(locale, "auth.welcome.familyName")} locale={locale}>{(p) => <Input {...p} autoComplete="family-name" value={f.family_name} onChange={set("family_name")} />}</Field>
      <Field label={t(locale, "auth.welcome.nameBn")} locale={locale}>{(p) => <Input {...p} lang="bn" value={f.name_bn} onChange={set("name_bn")} />}</Field>
      <Field label={t(locale, "auth.welcome.birth")} required error={errors.birth} locale={locale}>{(p) => <Input {...p} type="date" value={f.birth_date} onChange={set("birth_date")} />}</Field>
      <Field label={t(locale, "auth.welcome.age")} locale={locale}>{(p) => <Input {...p} inputMode="numeric" value={f.age} onChange={set("age")} />}</Field>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-dense font-semibold">{t(locale, "auth.welcome.sex")}</legend>
        <RadioGroup value={sex} onValueChange={(v) => setSex(v as typeof sex)} aria-label={t(locale, "auth.welcome.sex")}>
          <RadioItem value="female" label={t(locale, "auth.welcome.female")} />
          <RadioItem value="male" label={t(locale, "auth.welcome.male")} />
          <RadioItem value="other" label={t(locale, "auth.welcome.other")} />
        </RadioGroup>
        {errors.sex && <p role="alert" className="m-0 text-caption font-medium text-signal">{errors.sex}</p>}
      </fieldset>
      <AreaPicker locale={locale} onChange={setArea} />
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-dense font-semibold">{t(locale, "auth.welcome.language")}</legend>
        <RadioGroup value={lang} onValueChange={(v) => setLang(v as "bn" | "en")} aria-label={t(locale, "auth.welcome.language")}>
          <RadioItem value="bn" label="বাংলা" />
          <RadioItem value="en" label="English" />
        </RadioGroup>
      </fieldset>
      <Button type="submit" size="lg" loading={busy}>{t(locale, "auth.welcome.continue")}</Button>
    </form>
  );
}

