"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { authErrorKey } from "../../auth/errors";
import { useAuth } from "../../auth/me";
import { useSignInRedirect } from "../../auth/useSignInRedirect";
import { FEATURES } from "../../features/flags";
import { Button } from "../ui/button";
import { CodeInput, Field, Input } from "../ui/field";
import { FormAlert, StepHeading } from "./FormParts";

/** Seconds before a new code can be requested. UI courtesy only; the server owns rate limits. */
export const RESEND_SECONDS = 30;

function maskPhone(phone: string): string {
  const digits = phone.replace(/\s/g, "");
  return digits.length > 6 ? `${digits.slice(0, 2)}•••••${digits.slice(-4)}` : digits;
}

/** Patient sign-in: phone, then a single code field (AUTH_RBAC §4.1). First and returning sign-in are the same flow. */
export function PatientSignIn() {
  const locale = usePageLocale(undefined, "bn");
  const { requestOtp, verifyOtp, signOut } = useAuth();
  const redirect = useSignInRedirect();
  const [step, setStep] = useState<"phone" | "code" | "notSetUp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setFormError(null);
    if (!phone.trim()) return setFieldError(t(locale, "auth.error.required"));
    setFieldError(null);
    setBusy(true);
    try {
      await requestOtp(phone);
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setFormError(t(locale, authErrorKey(err, "otp")));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!code.trim()) return setFieldError(t(locale, "auth.error.required"));
    setFieldError(null);
    setBusy(true);
    try {
      const me = await verifyOtp(phone, code);
      if (redirect(me) === "none") {
        // A-04: a new patient may sign in with no `patient` role. Never drop them on an empty home.
        if (FEATURES.patientProfile) window.location.assign(`/${locale}/welcome`);
        else setStep("notSetUp");
      }
    } catch (err) {
      const key = authErrorKey(err, "otp");
      if (key === "auth.error.badCode") setFieldError(t(locale, key));
      else setFormError(t(locale, key));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (step === "notSetUp") {
    return (
      <>
        <StepHeading>{t(locale, "auth.patient.title")}</StepHeading>
        <FormAlert message={t(locale, "auth.patient.notSetUp")} />
        <Button variant="secondary" size="lg" onClick={() => signOut().then(() => setStep("phone"))}>
          {t(locale, "shell.signOut")}
        </Button>
      </>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <StepHeading>{t(locale, "auth.patient.codeTitle")}</StepHeading>
          <p className="m-0 text-dense text-ink-muted">
            {t(locale, "auth.patient.codeSent").replace("{phone}", maskPhone(phone))}{" "}
            <button type="button" className="text-indigo underline underline-offset-2" onClick={() => { setStep("phone"); setFieldError(null); }}>
              {t(locale, "auth.patient.changeNumber")}
            </button>
          </p>
        </div>
        <FormAlert message={formError} />
        <Field label={t(locale, "auth.patient.code")} required error={fieldError ?? undefined} locale={locale}>
          {(p) => (
            <CodeInput {...p} maxLength={6} value={code} readOnly={busy} onChange={(e) => setCode(e.target.value)} />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.patient.signingIn")}>
          {t(locale, "auth.patient.signIn")}
        </Button>
        <Button variant="quiet" disabled={cooldown > 0 || busy} onClick={() => send()}>
          {cooldown > 0 ? t(locale, "auth.patient.resendIn").replace("{s}", String(cooldown)) : t(locale, "auth.patient.resend")}
        </Button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={send} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <StepHeading>{t(locale, "auth.patient.title")}</StepHeading>
          <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.patient.help")}</p>
        </div>
        <FormAlert message={formError} />
        <Field label={t(locale, "auth.patient.phone")} required error={fieldError ?? undefined} locale={locale}>
          {(p) => (
            <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={phone} readOnly={busy} onChange={(e) => setPhone(e.target.value)} />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingLabel={t(locale, "auth.patient.sending")}>
          {t(locale, "auth.patient.sendCode")}
        </Button>
      </form>
      <hr className="m-0 border-0 border-t border-line" />
      <p className="m-0 flex flex-col gap-2 text-dense text-ink-muted">
        {t(locale, "auth.patient.orStaff")}
        <Link href={`/${locale}/login/staff`} className="text-indigo underline underline-offset-2">
          {t(locale, "auth.patient.staffLink")}
        </Link>
      </p>
    </>
  );
}

