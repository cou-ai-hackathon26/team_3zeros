"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ApiError } from "../../api/client";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { authErrorKey } from "../../auth/errors";
import { useAuth } from "../../auth/me";
import { useSignInRedirect } from "../../auth/useSignInRedirect";
import { Button } from "../ui/button";
import { Field, Input, PasswordInput } from "../ui/field";
import { FormAlert, StepHeading } from "./FormParts";

/** Patient self-registration (MASTERPLAN D-18): name, email or username, password. Signs the patient in on success. */
export function RegisterForm() {
  const locale = usePageLocale(undefined, "bn");
  const { registerPatient } = useAuth();
  const redirect = useSignInRedirect();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required = t(locale, "auth.error.required");
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = required;
    if (!identifier.trim()) next.identifier = required;
    if (!password) next.password = required;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      redirect(await registerPatient({ identifier, displayName: name, password }));
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors : {};
      if (fe.password) setErrors({ password: fe.password.join(" ") });
      else setFormError(t(locale, authErrorKey(err, "register")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <StepHeading>{t(locale, "auth.register.title")}</StepHeading>
        <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.register.help")}</p>
      </div>
      <FormAlert message={formError} />
      <Field label={t(locale, "auth.register.name")} required error={errors.name} locale={locale}>{(p) => <Input {...p} autoComplete="name" value={name} readOnly={busy} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label={t(locale, "auth.register.identifier")} required error={errors.identifier} locale={locale}>{(p) => <Input {...p} autoComplete="username" value={identifier} readOnly={busy} onChange={(e) => setIdentifier(e.target.value)} />}</Field>
      <Field label={t(locale, "auth.register.password")} required help={t(locale, "auth.register.rules")} error={errors.password} locale={locale}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" showLabel={t(locale, "auth.patient.show")} hideLabel={t(locale, "auth.patient.hide")} value={password} readOnly={busy} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.register.creating")}>{t(locale, "auth.register.create")}</Button>
      <p className="m-0 text-dense text-ink-muted">
        {t(locale, "auth.register.haveAccount")}{" "}
        <Link href={`/${locale}/login`} className="text-indigo underline underline-offset-2">{t(locale, "auth.register.signInLink")}</Link>
      </p>
    </form>
  );
}
