"use client";

import React from "react";
import Link from "next/link";
import { usePageLocale } from "../../app/usePageLocale";
import { t } from "../../i18n/format";
import { FEATURES } from "../../features/flags";
import { buttonVariants } from "../ui/button";
import dynamic from "next/dynamic";

// Loaded only when the Q-16 flag is on, so the public page does not carry the form.
const AccessRequestForm = dynamic(() => import("./AccessRequestForm").then((m) => m.AccessRequestForm));
import { StepHeading } from "./FormParts";

/** How staff get accounts: no self-service sign-up (SECURITY §3.1). The request form exists only behind the Q-16 flag. */
export function AccessInfo() {
  const locale = usePageLocale(undefined, "en");
  return (
    <>
      <div className="flex flex-col gap-2">
        <StepHeading>{t(locale, "auth.access.title")}</StepHeading>
        <p className="m-0 text-dense text-ink-muted">{t(locale, "auth.access.intro")}</p>
      </div>
      <ol className="m-0 flex flex-col gap-3 ps-5 text-body">
        <li>{t(locale, "auth.access.step1")}</li>
        <li>{t(locale, "auth.access.step2")}</li>
        <li>{t(locale, "auth.access.step3")}</li>
      </ol>
      <Link href={`/${locale}/login/staff`} className={buttonVariants({ size: "lg" })}>{t(locale, "auth.access.signIn")}</Link>
      {FEATURES.accessRequest && (
        <>
          <hr className="m-0 border-0 border-t border-line" />
          <AccessRequestForm />
        </>
      )}
    </>
  );
}
