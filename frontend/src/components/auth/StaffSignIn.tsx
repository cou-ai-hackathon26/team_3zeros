"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { authErrorKey } from "../../auth/errors";
import { useAuth } from "../../auth/me";
import type { UserMe } from "../../auth/types";
import { useSignInRedirect } from "../../auth/useSignInRedirect";
import { FEATURES } from "../../features/flags";
import { Button } from "../ui/button";
import { CodeInput, Field, Input, PasswordInput } from "../ui/field";
import { FormAlert, StepHeading } from "./FormParts";

/** Staff sign-in: identifier and password, then MFA on the same route (AUTH_RBAC §4.2). */
export function StaffSignIn() {
  const locale = usePageLocale(undefined, "en");
  const router = useRouter();
  const { loginStaff, verifyMfa } = useAuth();
  const redirect = useSignInRedirect();
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function finish(me: UserMe) {
    if (redirect(me) === "none") router.replace(`/${locale}/not-authorised`);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!identifier.trim() || !password) return setFieldError(t(locale, "auth.error.required"));
    setFieldError(null);
    setBusy(true);
    try {
      const result = await loginStaff(identifier, password);
      if (result.status === "mfa_required") setStep("mfa");
      else finish(result.me);
    } catch (err) {
      setFormError(t(locale, authErrorKey(err, "staff")));
      setPassword(""); // never keep a wrong password, and do not say which field was wrong
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!code.trim()) return setFieldError(t(locale, "auth.error.required"));
    setFieldError(null);
    setBusy(true);
    try {
      finish(await verifyMfa(code));
    } catch (err) {
      const key = authErrorKey(err, "mfa");
      if (key === "auth.error.mfaLost") {
        setStep("password");
        setFormError(t(locale, key));
      } else if (key === "auth.error.badMfa") setFieldError(t(locale, key));
      else setFormError(t(locale, key));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (step === "mfa") {
    return (
      <form onSubmit={submitMfa} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <StepHeading>{t(locale, "auth.staff.mfaTitle")}</StepHeading>
          <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.staff.mfaHelp")}</p>
        </div>
        <FormAlert message={formError} />
        <Field label={t(locale, "auth.patient.code")} required error={fieldError ?? undefined} locale={locale}>
          {(p) => <CodeInput {...p} maxLength={6} value={code} readOnly={busy} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.staff.verifying")}>
          {t(locale, "auth.staff.verify")}
        </Button>
        <Button variant="quiet" onClick={() => { setStep("password"); setFormError(null); setFieldError(null); }}>
          {t(locale, "auth.staff.back")}
        </Button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={submitPassword} className="flex flex-col gap-6" noValidate>
        <StepHeading>{t(locale, "auth.staff.title")}</StepHeading>
        <FormAlert message={formError} />
        <Field label={t(locale, "auth.staff.identifier")} required locale={locale}>
          {(p) => <Input {...p} type="text" autoComplete="username" value={identifier} readOnly={busy} onChange={(e) => setIdentifier(e.target.value)} />}
        </Field>
        <Field label={t(locale, "auth.staff.password")} required error={fieldError ?? undefined} locale={locale}>
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="current-password"
              showLabel={t(locale, "auth.staff.show")}
              hideLabel={t(locale, "auth.staff.hide")}
              value={password}
              readOnly={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.staff.signingIn")}>
          {t(locale, "auth.staff.signIn")}
        </Button>
        {FEATURES.passwordReset ? (
          <Link href={`/${locale}/login/staff/reset`} className="text-dense text-indigo underline underline-offset-2">
            {t(locale, "auth.staff.forgotLink")}
          </Link>
        ) : (
          <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.staff.forgotAsk")}</p>
        )}
        <Link href={`/${locale}/access`} className="text-dense text-indigo underline underline-offset-2">
          {t(locale, "auth.staff.howAccess")}
        </Link>
      </form>
      <hr className="m-0 border-0 border-t border-line" />
      <p className="m-0 flex flex-col gap-2 text-dense text-ink-muted">
        {t(locale, "auth.staff.orPatient")}
        <Link href={`/${locale}/login`} className="text-indigo underline underline-offset-2">
          {t(locale, "auth.staff.patientLink")}
        </Link>
      </p>
    </>
  );
}
