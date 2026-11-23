"use client";

import React, { useState } from "react";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { authErrorKey } from "../../auth/errors";
import { useAuth } from "../../auth/me";
import { useSignInRedirect } from "../../auth/useSignInRedirect";
import { Button } from "../ui/button";
import { Field, Input, PasswordInput } from "../ui/field";
import { AuthSwitch } from "./AuthSwitch";
import { FormAlert, StepHeading } from "./FormParts";

/** Patient sign-in: email or username and a password (MASTERPLAN D-18). There are no one-time codes. */
export function PatientSignIn() {
  const locale = usePageLocale(undefined, "bn");
  const { signIn, signOut } = useAuth();
  const redirect = useSignInRedirect();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!identifier.trim() || !password) return setFieldError(t(locale, "auth.error.required"));
    setFieldError(null);
    setBusy(true);
    try {
      const result = await signIn(identifier, password);
      // A patient-entrance sign-in never needs MFA; if the server asks for it, this is a staff account.
      if (result.status === "signed_in" && redirect(result.me) === "none") setNotSetUp(true);
      if (result.status === "mfa_required") setFormError(t(locale, "auth.error.badCredentials"));
    } catch (err) {
      setFormError(t(locale, authErrorKey(err, "patient")));
      setPassword(""); // never keep a wrong password, and do not say which field was wrong
    } finally {
      setBusy(false);
    }
  }

  if (notSetUp) {
    return (
      <>
        <StepHeading>{t(locale, "auth.patient.title")}</StepHeading>
        <FormAlert message={t(locale, "auth.patient.notSetUp")} />
        <Button variant="secondary" size="lg" onClick={() => signOut().then(() => setNotSetUp(false))}>{t(locale, "shell.signOut")}</Button>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <StepHeading>{t(locale, "auth.patient.title")}</StepHeading>
          <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.patient.help")}</p>
        </div>
        <FormAlert message={formError} />
        <Field label={t(locale, "auth.patient.identifier")} required locale={locale}>
          {(p) => <Input {...p} type="text" autoComplete="username" value={identifier} readOnly={busy} onChange={(e) => setIdentifier(e.target.value)} />}
        </Field>
        <Field label={t(locale, "auth.patient.password")} required error={fieldError ?? undefined} locale={locale}>
          {(p) => (
            <PasswordInput {...p} autoComplete="current-password" showLabel={t(locale, "auth.patient.show")} hideLabel={t(locale, "auth.patient.hide")} value={password} readOnly={busy} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.patient.signingIn")}>{t(locale, "auth.patient.signIn")}</Button>
      </form>
      <AuthSwitch current="patient" />
    </>
  );
}
