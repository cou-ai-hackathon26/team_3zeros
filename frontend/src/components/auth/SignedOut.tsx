"use client";

import "../../i18n/auth";
import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { areaOfPath } from "../../auth/access";
import { buttonVariants } from "../ui/button";
import { StepHeading } from "./FormParts";

/** Confirmation after sign-out or expiry. `next` is carried to sign-in, which validates it again. */
export function SignedOut() {
  const locale = usePageLocale(undefined, "bn");
  const params = useSearchParams();
  const expired = params?.get("reason") === "expired";
  const next = params?.get("next");
  const staff = next ? ["clinical", "admin"].includes(areaOfPath(next) ?? "") : false;
  const signIn = `/${locale}/login${staff ? "/staff" : ""}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <>
      <StepHeading>{expired ? t(locale, "auth.signedOut.expiredTitle") : t(locale, "auth.signedOut.title")}</StepHeading>
      {expired && <p className="m-0 text-body text-ink-muted">{t(locale, "auth.signedOut.expiredBody")}</p>}
      <div className="flex flex-col gap-3">
        <Link href={signIn} className={buttonVariants({ size: "lg" })}>{t(locale, "auth.signedOut.signIn")}</Link>
        <Link href={`/${locale}`} className={buttonVariants({ variant: "secondary", size: "lg" })}>{t(locale, "auth.signedOut.home")}</Link>
      </div>
    </>
  );
}
