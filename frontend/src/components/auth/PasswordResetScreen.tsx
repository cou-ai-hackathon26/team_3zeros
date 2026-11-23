"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { useAdapters } from "../../features/adapters";
import { Button, buttonVariants } from "../ui/button";
import { Field, Input, PasswordInput } from "../ui/field";
import { FormAlert, StepHeading, genericError } from "./FormParts";

/** Q-14 · `/login/staff/reset`. The request step always shows the same message so it cannot reveal which accounts exist. */
export function PasswordResetScreen() {
  const locale = usePageLocale(undefined, "en");
  const { passwordReset } = useAdapters();
  const token = useSearchParams()?.get("token") ?? null;
  const [value, setValue] = useState("");
  const [state, setState] = useState<"form" | "neutral" | "done" | "expired">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!value.trim()) return setError(t(locale, "auth.error.required"));
    setBusy(true);
    try {
      if (token) setState(await passwordReset.complete(token, value));
      else {
        await passwordReset.request(value.trim());
        setState("neutral");
      }
    } catch (err) {
      setError(genericError(locale, err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "neutral") return <><StepHeading>{t(locale, "auth.reset.title")}</StepHeading><p role="status" className="m-0 text-body">{t(locale, "auth.reset.neutral")}</p></>;
  if (state === "done") return <><StepHeading>{t(locale, "auth.reset.title")}</StepHeading><p role="status" className="m-0 text-body">{t(locale, "auth.reset.done")}</p><Link href={`/${locale}/login/staff`} className={buttonVariants({ size: "lg" })}>{t(locale, "auth.staff.signIn")}</Link></>;
  if (state === "expired") return <><StepHeading>{t(locale, "auth.reset.title")}</StepHeading><FormAlert message={t(locale, "auth.reset.expired")} /><Link href={`/${locale}/login/staff/reset`} className={buttonVariants({ variant: "secondary", size: "lg" })}>{t(locale, "auth.reset.send")}</Link></>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <StepHeading>{token ? t(locale, "auth.reset.newTitle") : t(locale, "auth.reset.title")}</StepHeading>
        <p className="m-0 text-dense text-ink-muted">{token ? t(locale, "auth.reset.rules") : t(locale, "auth.reset.help")}</p>
      </div>
      <FormAlert message={error} />
      {token ? (
        <Field label={t(locale, "auth.reset.newPassword")} required locale={locale}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" showLabel={t(locale, "auth.staff.show")} hideLabel={t(locale, "auth.staff.hide")} value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      ) : (
        <Field label={t(locale, "auth.reset.identifier")} required locale={locale}>
          {(p) => <Input {...p} autoComplete="username" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      )}
      <Button type="submit" size="lg" loading={busy}>{token ? t(locale, "auth.reset.save") : t(locale, "auth.reset.send")}</Button>
    </form>
  );
}

